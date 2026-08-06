import { supabase } from "./supabase";

export async function isAdmin(email: string | undefined) {
  if (!email) return false;

  const { data, error } = await supabase
    .from("admins")
    .select("email")
    .eq("email", email)
    .single();

  if (error) {
    console.log("ADMIN CHECK:", error);
    return false;
  }

  return !!data;
}
