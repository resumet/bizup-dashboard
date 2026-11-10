import {
  assertInstructorContractOrigin,
  deleteInstructorContractInstructor,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: Promise<{ instructorId: string }> }) {
  try {
    assertInstructorContractOrigin(request);
    const { instructorId } = await params;
    if (!UUID.test(instructorId)) return Response.json({ message: "강사 정보를 확인해 주세요." }, { status: 400 });
    await deleteInstructorContractInstructor(await requireInstructorContractContext(), instructorId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
