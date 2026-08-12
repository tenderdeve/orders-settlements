import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, handler, json } from "@/lib/http";
import { credentialsSchema } from "@/lib/validation";
import { User } from "@/models/User";

// A real bcrypt hash of a value nobody can supply. Comparing against it when the
// email is unknown keeps the response time of "no such user" and "wrong password"
// in the same range, so the endpoint cannot be used to enumerate accounts by timing.
const DUMMY_HASH = "$2b$10$C6UzMDM.H6dfI/f/IKcEe.tCnf0DoMOoYcnjnaCn8fJj0Bd5TfWLu";

export const POST = handler(async (req) => {
  await db();
  const { email, password } = credentialsSchema.parse(await req.json());

  const user = await User.findOne({ email }).select("passwordHash").lean();
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  // Same code for unknown email and wrong password, for the same reason.
  if (!user || !ok) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const id = String(user._id);
  return setSessionCookie(json({ user: { id, email } }), await signSession({ id, email }));
});
