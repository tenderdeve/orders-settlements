import { hashPassword, setSessionCookie, signSession } from "@/lib/auth";
import { db, isDuplicateKey } from "@/lib/db";
import { ApiError, handler, json } from "@/lib/http";
import { credentialsSchema } from "@/lib/validation";
import { User } from "@/models/User";

export const POST = handler(async (req) => {
  await db();
  const { email, password } = credentialsSchema.parse(await req.json());

  let id: string;
  try {
    const user = await User.create({ email, passwordHash: await hashPassword(password) });
    id = String(user._id);
  } catch (e) {
    // The unique index is the constraint; check-then-insert would race.
    if (isDuplicateKey(e)) {
      throw new ApiError(
        409,
        "EMAIL_TAKEN",
        "An account with that email already exists.",
        undefined,
        "Log in instead, or use a different email.",
      );
    }
    throw e;
  }

  return setSessionCookie(json({ user: { id, email } }, 201), await signSession({ id, email }));
});
