import { requireUser } from "@/lib/auth";
import { handler, json } from "@/lib/http";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  return json({ user });
});
