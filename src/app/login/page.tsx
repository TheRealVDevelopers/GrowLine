import { Suspense } from "react";
import LoginFlow from "./LoginFlow";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFlow />
    </Suspense>
  );
}
