import AdminProductForm from '@/components/admin/AdminProductForm';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminEditProductPage({ params }: PageProps) {
  const { id } = await params;
  return <AdminProductForm mode="edit" productId={id} />;
}
