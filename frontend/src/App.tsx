import { Routes, Route } from "react-router-dom";
import { UploadPage } from "./UploadPage";
import { TestPage } from "./TestPage";
import { UsersPage } from "./UsersPage";
import { SharedTestPage, LegacyTestRedirect } from "./SharedTestPage";

export function App() {
  return (
    <Routes>
      {/* Public: anyone can upload a lecture video (shared pool). */}
      <Route path="/upload" element={<UploadPage />} />
      {/* Everyone and their progress. */}
      <Route path="/users" element={<UsersPage />} />
      {/* Shared test link: open a lecture's test at a specific generation. */}
      <Route path="/t/:lectureId/:version" element={<SharedTestPage />} />
      {/* Legacy single-id link: resolve to the versioned URL above. */}
      <Route path="/t/:quizSetId" element={<LegacyTestRedirect />} />
      {/* Login by name -> pick a shared lecture -> take a test. */}
      <Route path="*" element={<TestPage />} />
    </Routes>
  );
}
