import { instructorContractInstructorSchema } from "@/lib/contracts/instructor-contract-validation";
import {
  assertInstructorContractOrigin,
  createInstructorContractInstructor,
  instructorContractResponseError,
  loadInstructorContractInstructors,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export async function GET() {
  try {
    const context = await requireInstructorContractContext();
    return Response.json({ instructors: await loadInstructorContractInstructors(context) });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertInstructorContractOrigin(request);
    const context = await requireInstructorContractContext();
    const instructor = await createInstructorContractInstructor(
      context,
      instructorContractInstructorSchema.parse(await request.json()),
    );
    return Response.json({ instructor }, { status: 201 });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
