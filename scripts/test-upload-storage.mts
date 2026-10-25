import assert from 'node:assert/strict';
import { test } from 'node:test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { savePublicImage, deletePublicImage } from '../src/lib/uploadStorage';

test('S3 upload and deletion use the same project prefix and object key', async (t) => {
  const before = { ...process.env };
  t.after(() => { process.env = before; });
  Object.assign(process.env, {
    S3_ENDPOINT: 'https://storage.example.test', S3_BUCKET: 'shared',
    S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test', S3_DIRECTORY: '/belok/',
  });
  delete process.env.S3_PUBLIC_BASE_URL;
  const commands: Array<PutObjectCommand | DeleteObjectCommand> = [];
  t.mock.method(S3Client.prototype, 'send', async (command: PutObjectCommand | DeleteObjectCommand) => {
    commands.push(command); return {};
  });
  const image = new File(['image bytes'], 'photo.png', { type: 'image/png' });
  const url = await savePublicImage(image, 'products');
  assert.match(url, /^https:\/\/storage\.example\.test\/shared\/belok\/products\/[a-f0-9-]+\.png$/);
  assert.equal(commands[0].input.Bucket, 'shared');
  await deletePublicImage(url);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, commands[0].input.Key);

  delete process.env.S3_DIRECTORY;
  const legacyUrl = await savePublicImage(image, 'avatars');
  assert.match(legacyUrl, /^https:\/\/storage\.example\.test\/shared\/avatars\//);
  process.env.S3_DIRECTORY = '../other-project';
  await assert.rejects(savePublicImage(image, 'products'), /Invalid S3_DIRECTORY/);
});
