import Link from "next/link";

import { Title } from "../common";

import SignIn from "./sign-in";

interface Params {
  redirectTo?: string;
  reset?: string;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { reset, redirectTo } = await searchParams;

  return (
    <>
      <Title className="mb-12">
        Welcome back.
        <br />
        Log in to your account below.
      </Title>

      {/* Google sign-in removed; only email/password auth is shown */}

      <SignIn reset={!!reset} redirectTo={redirectTo} />

      <Link href="/reset" className="text-[#364239] text-[16px] mt-6 hover:underline">
        Forgot password?
      </Link>
    </>
  );
}
