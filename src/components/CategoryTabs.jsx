import React from "react";
import "./CategoryTabs.css";

export default function CategoryTabs({
  activeTab,
  onChange,
  tabs = [], // ✅ IMPORTANT FIX
}) {
  return (
    <div className="tabs-wrapper">
      <div className="tabs-container">
        {tabs.map((tab) => {
          const isActive = tab.value === activeTab;

          return (
            <span
              key={tab.value}
              className={`tab-item ${isActive ? "active" : ""}`}
              onClick={() => onChange(tab.value)}
            >
              {tab.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
