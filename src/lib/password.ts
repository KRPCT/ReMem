import bcrypt from "bcryptjs";

const COST = 10; // D-05

export const hashPassword = (pw: string) => bcrypt.hash(pw, COST);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
