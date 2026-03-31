import { getUserFromToken } from "../../helpers/utils";

export const authenticateUser = async (context: any) => {
  // console.log("authenticateUser", context);
  const authHeader = context.req?.headers?.authorization;
  // console.log("authHeader", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Authentication required. Please provide a valid token." };
  }

  const token = authHeader.substring(7);
  const user = await getUserFromToken(token);

  if (!user) return { error: "Invalid or expired token" };

  return { user };
};

export const authenticateUserREST = async (req: any) => {
  // console.log("authenticateUser", context);
  const authHeader = req.headers?.authorization;
  // console.log("authHeader", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Authentication required. Please provide a valid token." };
  }

  const token = authHeader.substring(7);
  const user = await getUserFromToken(token);

  if (!user) return { error: "Invalid or expired token" };

  return { user };
};
