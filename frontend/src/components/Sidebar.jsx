import React from "react";
import { NavLink } from "react-router-dom";
import documentIcon from "../assets/document.png";
import queryIcon from "../assets/query.png";

const Sidebar = ({ isOpen }) => (
  <div className={`sidebar ${isOpen ? "open" : ""}`}>
    <h2>AI Document Indexer</h2>
    <nav>
      <NavLink to="/document">
        <img src={documentIcon} alt="Document" className="sidebar-icon" />
        <span>Document Inject</span>
      </NavLink>
      <NavLink to="/query">
        <img src={queryIcon} alt="Query" className="sidebar-icon" />
        <span>Search Query</span>
      </NavLink>
    </nav>
  </div>
);

export default Sidebar;