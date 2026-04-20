"use client";

const NAMES = ["Otter", "Falcon", "Lynx", "Koi", "Wren", "Heron", "Ibis", "Fox", "Crane", "Dune"];
const COLORS = ["#FD5A0E", "#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#EF4444"];

export interface User {
  id: string;
  name: string;
  color: string;
}

const KEY = "veed-killer:user";

export function getLocalUser(): User {
  if (typeof window === "undefined") {
    return { id: "ssr", name: "You", color: COLORS[0] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as User;
  } catch {
    // noop
  }
  const u: User = {
    id: crypto.randomUUID(),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  localStorage.setItem(KEY, JSON.stringify(u));
  return u;
}

export function setLocalUser(patch: Partial<User>) {
  const u = { ...getLocalUser(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(u));
  return u;
}
