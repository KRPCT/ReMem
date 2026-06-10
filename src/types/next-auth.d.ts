import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }

  interface User {
    id?: string;
  }
}

// D-03: JWT carries userId only; Session table check is by userId.
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
