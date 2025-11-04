import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import DocumentInject from "./components/DocumentInject.jsx";
import Query from "./components/Query.jsx";
import "./index.css";

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <Router>
      <div className="dashboard-container">
        <button className="hamburger-btn" onClick={toggleSidebar}>
          <svg
            className="hamburger-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-gray)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Sidebar isOpen={isSidebarOpen} />
        <div className="content-area">
          <Routes>
            <Route path="/" element={<Navigate to="/query" />} />
            <Route path="/query" element={<Query />} />
            <Route path="/document" element={<DocumentInject />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;