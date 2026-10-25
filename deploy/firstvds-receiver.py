#!/usr/bin/python3
"""Receive a prebuilt release over restricted SSH, verify it, switch and retain two."""
import fcntl,json,os,re,shutil,subprocess,sys,tarfile,tempfile,time,urllib.request
from pathlib import Path

def atomic_link(pointer,target):
 pointer=Path(pointer);temporary=pointer.with_name(pointer.name+'.new')
 temporary.unlink(missing_ok=True);temporary.symlink_to(target,target_is_directory=True);os.replace(temporary,pointer)

def extract(archive,destination):
 with tarfile.open(archive) as package:
  members=package.getmembers()
  if len(members)>80000 or sum(m.size for m in members)>2*1024**3:raise RuntimeError('Expanded archive exceeds limit')
  if any(p.startswith('.env') for m in members for p in Path(m.name).parts):raise RuntimeError('Environment files must stay on server')
  package.extractall(destination,filter='data')

def prune(releases,current,previous,keep=2):
 releases=Path(releases)
 if releases.is_symlink():raise RuntimeError('Release directory must not be a symlink')
 releases=releases.resolve()
 protected=set()
 for pointer in [current,previous]:
  p=Path(pointer)
  if not p.exists():continue
  target=p.resolve()
  if target.parent!=releases:raise RuntimeError('Release pointer leaves release directory')
  protected.add(target)
 candidates=sorted([p for p in releases.iterdir() if p.is_dir() and not p.is_symlink() and re.fullmatch(r'[a-f0-9]{40}(?:-\d+-\d+)?',p.name)],key=lambda p:p.stat().st_mtime,reverse=True)
 survivors=set(protected)
 for p in candidates:
  if len(survivors)<keep:survivors.add(p)
 removed=[]
 for p in candidates:
  if p not in survivors:
   if p.resolve().parent!=releases:raise RuntimeError('Unsafe cleanup path')
   shutil.rmtree(p);removed.append(p.name)
 return removed

def health(port,project,release=None,timeout=60):
 deadline=time.monotonic()+timeout
 path='/api/products' if project=='belok' else ('/api/health' if project=='ffworks' else '/')
 while time.monotonic()<deadline:
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}',timeout=5) as r:
    body=r.read()
    if r.status!=200:raise RuntimeError('HTTP health failure')
    if project=='belok' and not json.loads(body).get('products'):raise RuntimeError('Menu unavailable')
    if project=='ffworks':
     data=json.loads(body)
     if data.get('status')!='ok' or release and data.get('release')!=release:raise RuntimeError('Wrong release or database unavailable')
    return
  except Exception:time.sleep(1)
 raise RuntimeError('Application readiness failed')

def pm2(*args):subprocess.run(['pm2',*args],check=True,stdout=subprocess.DEVNULL,timeout=60)

def main():
 project=sys.argv[1]
 settings=json.loads(Path('/etc/firstvds-deploy/projects.json').read_text())[project]
 command=os.environ.get('SSH_ORIGINAL_COMMAND','')
 match=re.fullmatch(r'deploy ([a-f0-9]{40}-\d+-\d+)',command)
 if not match:raise RuntimeError('Only deploy <commit>-<run>-<attempt> is allowed')
 release_id=match[1];sha=release_id[:40]
 os.environ['PATH']='/root/.nvm/versions/node/v24.14.1/bin:/usr/local/bin:/usr/bin:/bin'
 releases=Path(settings['releases']);releases.mkdir(parents=True,exist_ok=True)
 current=Path(settings['current']);previous=Path(settings['previous'])
 with open('/var/lock/firstvds-deploy-'+project+'.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  release=releases/release_id
  if release.exists():raise RuntimeError('Release already exists; rerun CI with a new attempt')
  archive=None;candidate=None;activated=False;old_target=current.resolve() if current.exists() else None
  config_path=Path(settings['config']);old_config=config_path.read_text()
  try:
   with tempfile.NamedTemporaryFile(prefix='firstvds-'+project+'-',suffix='.tgz',dir='/root',delete=False) as output:
    archive=Path(output.name);size=0
    while chunk:=sys.stdin.buffer.read(1024*1024):
     size+=len(chunk)
     if size>512*1024**2:raise RuntimeError('Compressed archive exceeds limit')
     output.write(chunk)
   release.mkdir(mode=0o700);extract(archive,release)
   if not (release/'server.js').is_file() or not (release/'.next/BUILD_ID').is_file():raise RuntimeError('Standalone runtime missing')
   if project in ['belok','kfn'] and (release/'REVISION').read_text().strip()!=sha:raise RuntimeError('Commit mismatch')
   if project=='ffworks' and json.loads((release/'release.json').read_text())['releaseId']!=release_id:raise RuntimeError('Release manifest mismatch')
   for path in settings.get('env_files',[]):
    if not Path(path).is_file():raise RuntimeError('Production environment file missing')
   for relative,target in settings.get('shared_merge',{}).items():
    p=release/relative;shared=Path(target);shared.mkdir(parents=True,exist_ok=True)
    if p.is_symlink():raise RuntimeError('Shared assets must be regular directories')
    if p.exists():shutil.copytree(p,shared,dirs_exist_ok=True);shutil.rmtree(p)
    p.parent.mkdir(parents=True,exist_ok=True);p.symlink_to(shared,target_is_directory=True)
   for relative,target in settings.get('shared',{}).items():
    p=release/relative
    if p.is_symlink():p.unlink()
    elif p.exists():
     if p.is_dir() and all(x.name=='.gitkeep' for x in p.iterdir()):shutil.rmtree(p)
     else:raise RuntimeError('Release contains user uploads')
    p.parent.mkdir(parents=True,exist_ok=True);p.symlink_to(target,target_is_directory=True)
   config=json.loads(old_config);app=config['apps'][0]
   app.update(cwd=str(release),script=str(release/'server.js'),args=[])
   app['node_args']=['--env-file='+p for p in settings.get('env_files',[])]
   app['env']['RELEASE_ID']=release_id
   if project=='ffworks':
    (release/'.env').symlink_to(settings['env_files'][0])
    subprocess.run([app['interpreter'],'--env-file='+settings['env_files'][0],str(release/'scripts/db-migrate.mjs')],cwd=release,check=True,timeout=180,stdout=subprocess.DEVNULL)
   preview_env={**os.environ,**{k:str(v) for k,v in app['env'].items()},'PORT':str(settings['preview_port']),'HOSTNAME':'127.0.0.1','AQSI_WORKER_ENABLED':'false','BELOK_WORK_TELEGRAM_ENABLED':'false','INNOHUB_BUILD_ONLY':'1'}
   with open(release/'preview.log','wb') as log:
    candidate=subprocess.Popen([app['interpreter'],*app['node_args'],str(release/'server.js')],cwd=release,env=preview_env,stdout=log,stderr=subprocess.STDOUT)
    health(settings['preview_port'],project,release_id)
    if candidate.poll() is not None:raise RuntimeError('Preview exited')
    candidate.terminate();candidate.wait(timeout=15);candidate=None
   activated=True
   atomic_link(current,release)
   config_path.write_text(json.dumps(config,indent=2));config_path.chmod(0o600)
   pm2('delete',app['name']);pm2('start',str(config_path),'--only',app['name'])
   health(settings['port'],project,release_id)
   if old_target:atomic_link(previous,old_target)
   pm2('save')
   removed=prune(releases,current,previous)
   print(f'Deployed {project} {release_id}; retained current and previous; removed {len(removed)} older releases',flush=True)
  except Exception:
   if candidate and candidate.poll() is None:
    candidate.terminate()
    try:candidate.wait(timeout=10)
    except subprocess.TimeoutExpired:candidate.kill();candidate.wait()
   if activated:
    if old_target:atomic_link(current,old_target)
    config_path.write_text(old_config);config_path.chmod(0o600)
    # Recreate only this application, keeping other projects online.
    subprocess.run(['pm2','delete',project],stdout=subprocess.DEVNULL)
    pm2('start',str(config_path),'--only',project);pm2('save')
    health(settings['port'],project)
   # Failed releases cannot accumulate outside the two successful revisions.
   if release.exists() and (not current.exists() or current.resolve()!=release):shutil.rmtree(release)
   raise
  finally:
   if archive:archive.unlink(missing_ok=True)

if __name__=='__main__':
 try:main()
 except Exception as error:
  print(f'Deployment failed: {type(error).__name__}: {error}',file=sys.stderr);sys.exit(1)
