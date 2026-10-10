import ComboEditor from '@/components/admin/ComboEditor';
export default async function EditComboPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ComboEditor productId={id}/>;}
