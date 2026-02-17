import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;

  return <LoginClient created={created === '1'} />;
}
