export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
