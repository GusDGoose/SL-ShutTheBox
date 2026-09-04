import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest runs with globals: false, so Testing Library cannot find a global
// afterEach to hook its automatic cleanup onto. Without this, every test's DOM
// stays in the document and queries start matching several elements at once.
afterEach(cleanup);
