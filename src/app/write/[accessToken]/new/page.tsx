import { redirect } from "next/navigation";

type Props = { params: Promise<{ accessToken: string }> };

export default async function NewExternalDocumentPage({ params }: Props) {
  const { accessToken } = await params;
  redirect(`/write/${accessToken}`);
}
