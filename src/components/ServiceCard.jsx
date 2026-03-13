import React from "react";

import "../Services.css";
import "./ServiceCard.css";

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

export default function ServiceCard({ service, onView, onBookNow }) {


  return (
    <div className="service-card" onClick={() => onView(service.slug)}>
      {service.image && (
        <img
          src={service.image}
          alt={service.title}
          className="service-card-image"
          loading="lazy"
        />
      )}

      <div className="service-card-content">
        <h3 className="service-title">{service.title}</h3>

        {service.duration && (
          <p className="service-duration">{service.duration}</p>
        )}

        <div className="service-price-row">
          {service.original_price && (
            <span className="mrp">{getCurrency(service.original_price)}{String(service.original_price).replace(/^[^\d\s]+\s*/, "")}</span>
          )}

          <span className="offer-price">
            {getCurrency(service.price)}{String(service.price).replace(/^[^\d\s]+\s*/, "")}
          </span>

          {(service.discount_label || (service.discount_percent > 0) || service.original_price) && (
            <span className="offer-badge-premium">
              {service.discount_label || (service.discount_percent > 0 ? `${service.discount_percent}% OFF` : "SPECIAL OFFER")}
            </span>
          )}
        </div>

        <div className="actions">
          {/* View Service */}
          <button
            type="button"
            className="view-service-btn"
            onClick={(e) => {
              e.stopPropagation();
              onView(service.slug);
            }}
          >
            View Service
          </button>

          {/* Book Now */}
          {onBookNow && (
            <button
              type="button"
              className="book-now-btn"
              onClick={(e) => {
                e.stopPropagation();
                onBookNow(service.slug);
              }}
            >
              Book Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
