import React from "react";

const FeatureCard = ({ icon, title, description }) => (
  <div className="card">
    <h3><img src={icon} alt={title} className="feature-icon"/> {title}</h3>
    <p>{description}</p>
  </div>
);

export default FeatureCard;
