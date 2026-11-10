import {
  assertInstructorContractOrigin,
  deleteInstructorContract,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: Promise<{ contractId: string }> }) {
  try {
    assertInstructorContractOrigin(request);
    const { contractId } = await params;
    if (!UUID.test(contractId)) return Response.json({ message: "계약서를 확인해 주세요." }, { status: 400 });
    await deleteInstructorContract(await requireInstructorContractContext(), contractId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
