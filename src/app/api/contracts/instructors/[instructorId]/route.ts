import {
  assertInstructorContractOrigin,
  deleteInstructorContractInstructor,
  instructorContractResponseError,
  requireInstructorContractContext,
  updateInstructorContractInstructor,
} from "@/lib/contracts/instructor-contract-template-server";
import { instructorContractInstructorSchema } from "@/lib/contracts/instructor-contract-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: Request, { params }: { params: Promise<{ instructorId: string }> }) {
  try {
    assertInstructorContractOrigin(request);
    const { instructorId } = await params;
    if (!UUID.test(instructorId)) return Response.json({ message: "거래처 정보를 확인해 주세요." }, { status: 400 });
    const instructor = await updateInstructorContractInstructor(
      await requireInstructorContractContext(),
      instructorId,
      instructorContractInstructorSchema.parse(await request.json()),
    );
    return Response.json({ instructor });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}

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
