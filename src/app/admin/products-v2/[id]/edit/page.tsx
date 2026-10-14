import ProductV2Recipe from '@/components/admin/ProductV2Recipe';
export default async function ProductRecipePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <ProductV2Recipe id={id}/>;
}
