import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const { created, error } = await searchParams;

  return <LoginClient created={created === '1'} initialError={error} />;
}
