import { Routes, Route } from "react-router-dom";
import { UploadPage } from "./UploadPage";
import { TestPage } from "./TestPage";
import { UsersPage } from "./UsersPage";

export function App() {
  return (
    <Routes>
      {/* Public: anyone can upload a lecture video (shared pool). */}
      <Route path="/upload" element={<UploadPage />} />
      {/* Everyone and their progress. */}
      <Route path="/users" element={<UsersPage />} />
      {/* Login by name -> pick a shared lecture -> take a test. */}
      <Route path="*" element={<TestPage />} />
    </Routes>
  );
}
