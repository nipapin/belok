import AdminProductForm from '@/components/admin/AdminProductForm';
export default async function ProductDetailsPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <AdminProductForm mode="edit" productId={id} productsV2/>;
}
