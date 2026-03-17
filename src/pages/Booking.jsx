import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FiArrowLeft, FiX } from "react-icons/fi";
import { supabase } from "../components/supabaseClient";
import Header from "../components/SampleHeader";
import { useToast } from "../components/Toast/ToastContext";
import { parseDurationToMinutes, formatDuration } from "../utils/durationUtils";

import "./Booking.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DEFAULT_TIMES = [
  "9:00 am", "9:30 am", "10:00 am", "10:30 am",
  "11:00 am", "11:30 am", "12:00 pm", "12:30 pm",
  "1:00 pm", "1:30 pm", "2:00 pm", "2:30 pm",
  "3:00 pm", "3:30 pm", "4:00 pm", "4:30 pm"
];
const DEFAULT_YEARS = [2026, 2027, 2028];

const today = new Date();

/* ================= DATE CHECK ================= */
const isPastDate = (y, m, d) => {
  const date = new Date(y, m, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date < base;
};

/* ================= TIME PARSER ================= */
const timeToMinutes = (time) => {
  if (!time || typeof time !== "string") return 0;
  const [t, meridiem] = time.split(" ");
  let [h, m] = t.split(":").map(Number);

  if (meridiem === "pm" && h !== 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;

  return h * 60 + m;
};

/* ================= TIME CHECK ================= */
const isPastTime = (time, y, m, d) => {
  const now = new Date();
  const slotMinutes = timeToMinutes(time);
  const slotTime = new Date(y, m, d, Math.floor(slotMinutes / 60), slotMinutes % 60);
  return slotTime <= now;
};

/* ================= BLOCK NEXT 1.5 HOURS FROM NOW ================= */
const isWithinNext90Minutes = (time, y, m, d) => {
  const now = new Date();
  const slotMinutes = timeToMinutes(time);
  const slotTime = new Date(y, m, d, Math.floor(slotMinutes / 60), slotMinutes % 60);
  return slotTime <= new Date(now.getTime() + 90 * 60 * 1000);
};

/* ================= CALENDAR ================= */
const getCalendarMatrix = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};



/* ================= PRICE ================= */
const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

const formatPrice = (value) =>
  Number(String(value || "").replace(/[^\d]/g, ""));

export default function Booking({ user }) {

  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [selectedServices, setSelectedServices] = useState(location.state?.services || []);

  /* ================= SCHEDULE CONFIG STATE ================= */
  const [TIMES, setTimes] = useState(DEFAULT_TIMES);
  const [YEARS, setYears] = useState(DEFAULT_YEARS);

  /* ================= FETCH SCHEDULE CONFIG ================= */
  useEffect(() => {
    supabase
      .from("schedule_config")
      .select("config_key, config_value")
      .then(({ data }) => {
        if (!data) return;
        data.forEach(({ config_key, config_value }) => {
          // Supabase JSONB can come back as a parsed object OR as a raw JSON string
          let parsed = config_value;
          if (typeof parsed === "string") {
            try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
          }

          if (config_key === "time_slots") {
            const arr = Array.isArray(parsed) ? parsed : [];
            // Each item is { value: "9:00 am", active: true }
            const slots = arr
              .filter(item => item?.active !== false)
              .map(item => (typeof item === "string" ? item : item?.value))
              .filter(v => typeof v === "string" && v.trim().length > 0);
            if (slots.length > 0) setTimes(slots);
          }
          if (config_key === "years") {
            const arr = Array.isArray(parsed) ? parsed : [];
            const yrs = arr.map(Number).filter(Boolean);
            if (yrs.length > 0) setYears(yrs);
          }
        });
      });
  }, []);

  /* ================= ADD-ONS STATE ================= */
  const [addOns, setAddOns] = useState([]);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddOnDetail, setShowAddOnDetail] = useState(false);
  const [selectedAddOn, setSelectedAddOn] = useState(null);

  const currency = useMemo(() => {
    const firstService = selectedServices[0];
    return getCurrency(firstService?.price || firstService?.original_price);
  }, [selectedServices]);

  const fetchFreshData = useCallback(async () => {
    // Only run if we actually have services to check
    setSelectedServices((currentServices) => {
      if (currentServices.length === 0) return currentServices;

      const ids = currentServices.map((s) => s.id).filter(Boolean);
      if (ids.length === 0) return currentServices;

      (async () => {
        const { data: servicesData } = await supabase
          .from("services")
          .select("*")
          .in("id", ids);

        const { data: addonsData } = await supabase
          .from("add_ons")
          .select("id, title, duration, price, original_price, discount_percent, image, work_includes, description, work_not_included, service_type, max_quantity")
          .in("id", ids);

        const freshMap = new Map();
        if (servicesData) {
          servicesData.forEach((s) => freshMap.set(s.id, { ...s, isAddon: false }));
        }
        if (addonsData) {
          addonsData.forEach((s) => freshMap.set(s.id, { ...s, isAddon: true }));
        }

        let claimedOffer = null;
        try {
          const stored = sessionStorage.getItem("claimedOffer");
          if (stored) claimedOffer = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing claimedOffer:", e);
        }

        const { data: offersData } = await supabase
          .from("offers")
          .select("*")
          .eq("is_offer_enabled", true)
          .order("created_at", { ascending: false });

        setSelectedServices((prev) =>
          prev.map((s) => {
            const fresh = freshMap.get(s.id);
            if (fresh) {
              const isClaimed = claimedOffer && claimedOffer.serviceId === fresh.id;
              const matchingOffer = (offersData || []).find((o) => o.title === fresh.title);

              let finalPrice = fresh.price;
              let finalDiscountPercent = parseFloat(fresh.discount_percent) || 0;
              let finalDiscountLabel =
                (fresh.discount_label ? fresh.discount_label.toUpperCase() : null) ||
                (finalDiscountPercent > 0 ? `${finalDiscountPercent}% OFF` : null);

              if (isClaimed) {
                finalPrice = claimedOffer.offerPrice !== undefined ? claimedOffer.offerPrice : fresh.price;
                finalDiscountPercent = claimedOffer.offerPercentage;
                finalDiscountLabel = `${claimedOffer.offerPercentage}% OFF`;
              } else if (matchingOffer) {
                const offerPrice = matchingOffer.offer_price || matchingOffer.fixed_price;
                const offerPct = parseFloat(matchingOffer.offer_percentage) || 0;
                const originalPrice = fresh.original_price
                  ? parseFloat(String(fresh.original_price).replace(/[^\d.]/g, ""))
                  : null;

                if (offerPrice !== undefined && offerPrice !== null) {
                  finalPrice = offerPrice;
                } else if (originalPrice && offerPct > 0) {
                  finalPrice = Math.round(originalPrice * (1 - offerPct / 100));
                }

                finalDiscountPercent = offerPct;
                finalDiscountLabel = offerPct > 0 ? `${offerPct}% OFF` : "SPECIAL OFFER";
              }

              return {
                ...s,
                ...fresh,
                price: finalPrice,
                discount_percent: finalDiscountPercent,
                discount_label: finalDiscountLabel,
                quantity: s.quantity,
              };
            }
            return s;
          })
        );
      })();

      return currentServices;
    });
  }, []); // Only the logic inside matters, no dependency loop

  /* ================= FETCH ALL ADD-ONS ================= */
  useEffect(() => {
    supabase
      .from("add_ons")
      .select("id, title, duration, price, original_price, discount_percent, image, work_includes, description, work_not_included, service_type, max_quantity")
      .eq("service_type", selectedServices[0]?.service_type?.toUpperCase())
      .not("image", "is", null)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setAddOns(data);
        }
      });
  }, [selectedServices]);

  /* ================= QUANTITY LOGIC ================= */
  const addService = (svc) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (existing) {
        // Enforce max_quantity if it exists (default 3 from mobile)
        const limit = existing.max_quantity || 3;
        if (existing.quantity >= limit) {
          toast.error(`You can only add up to ${limit} of this service.`);
          return prev;
        }

        return prev.map((s) =>
          s.id === svc.id ? { ...s, quantity: (s.quantity || 1) + 1 } : s
        );
      }
      return [...prev, { ...svc, quantity: 1, isAddon: true }];
    });
  };

  const removeService = (id) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (existing && existing.quantity > 1) {
        return prev.map((s) =>
          s.id === id ? { ...s, quantity: s.quantity - 1 } : s
        );
      }
      return prev.filter((s) => s.id !== id);
    });
  };

  /* ================= BODY SCROLL LOCK ================= */
  useEffect(() => {
    if (showAddService || showAddOnDetail) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => document.body.classList.remove("no-scroll");
  }, [showAddService, showAddOnDetail]);

  useEffect(() => {
    fetchFreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONLY once on mount

  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  const CALENDAR = getCalendarMatrix(year, month);

  const selectedDayName = selectedDate
    ? FULL_DAYS[new Date(year, month, selectedDate).getDay()]
    : "";

  const totalAmount = selectedServices.reduce(
    (sum, s) => sum + formatPrice(s.price) * (s.quantity || 1),
    0
  );

  const originalTotalAmount = selectedServices.reduce(
    (sum, s) => sum + formatPrice(s.original_price) * (s.quantity || 1),
    0
  );

  const discountPercent = selectedServices[0]?.discount_percent || 0;

  const totalDurationMinutes = selectedServices.reduce(
    (sum, s) => sum + parseDurationToMinutes(s.duration) * (s.quantity || 1),
    0
  );

  return (
    <>
      <Header user={user} />

      <div className="booking-container">
        <button className="back-btn-circle" onClick={() => navigate(-1)} title="Back">
          <FiArrowLeft size={20} />
        </button>

        <div className="booking-layout">
          <div className="calendar-section">
            <h1>Schedule Your Service</h1>
            <p className="subtitle">Choose a date and time that works best for you.</p>

            <div className="row">
              <div className="month-year">
                <select value={month} onChange={(e) => {
                  setMonth(+e.target.value);
                  setSelectedDate(null);
                  setSelectedTime(null);
                }}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>

                <select value={year} onChange={(e) => {
                  setYear(+e.target.value);
                  setSelectedDate(null);
                  setSelectedTime(null);
                }}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="scheduler-row">
              <div className="calendar-grid">
                {DAYS.map((d) => <div key={d} className="day-label">{d}</div>)}

                {CALENDAR.map((d, i) =>
                  d ? (
                    <button
                      key={i}
                      className={`date ${selectedDate === d ? "selected" : ""}`}
                      disabled={isPastDate(year, month, d)}
                      onClick={() => {
                        setSelectedDate(d);
                        setSelectedTime(null);
                      }}
                    >
                      {d}
                    </button>
                  ) : <div key={i} className="empty" />
                )}
              </div>

              {selectedDate && (
                <div className="time-section">
                  <h4>Available Timings</h4>
                  <div className="time-grid">
                    {TIMES.map((t) => {
                      const isToday =
                        year === today.getFullYear() &&
                        month === today.getMonth() &&
                        selectedDate === today.getDate();

                      const slotMinutes = timeToMinutes(t);
                      const selectedMinutes = selectedTime
                        ? timeToMinutes(selectedTime)
                        : null;

                      const isSlotAfter3PM = slotMinutes >= 15 * 60;

                      const disabled =
                        (isToday &&
                          (
                            isPastTime(t, year, month, selectedDate) ||
                            (isSlotAfter3PM && isWithinNext90Minutes(t, year, month, selectedDate))
                          )) ||
                        (
                          selectedTime === "3:00 pm" &&
                          slotMinutes > selectedMinutes &&
                          slotMinutes <= selectedMinutes + 90
                        );

                      return (
                        <button
                          key={t}
                          disabled={disabled}
                          className={`time-box 
                            ${selectedTime === t ? "selected-time" : ""} 
                            ${disabled ? "disabled-time" : ""}`}
                          onClick={() => !disabled && setSelectedTime(t)}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="summary">
            <h3>Service Details</h3>

            <div className="services-wrapper">
              {selectedServices.map((s, i) => (
                <div key={i} className="service-item">
                  <div className="summary-item-title-row">
                    <strong>{s.title || s.name}</strong>
                    {s.quantity > 1 && (
                      <span className="qty-badge">x{s.quantity}</span>
                    )}
                  </div>
                  <p>
                    {formatDuration(s.duration)}
                  </p>
                  <div className="summary-item-price-row">
                    {s.original_price && (
                      <span className="mrp">
                        {getCurrency(s.original_price)}{formatPrice(s.original_price)}
                      </span>
                    )}
                    <span className="summary-item-price">
                      {getCurrency(s.price)}{formatPrice(s.price)}
                    </span>
                    <span className="offer-badge">
                      {(s.discount_label ||
                        (s.discount_percent > 0
                          ? `${s.discount_percent}% OFF`
                          : "SPECIAL OFFER")).toUpperCase()}
                    </span>
                  </div>
                  {s.isAddon && (
                    <div className="service-item-actions">
                      <button
                        className="remove-btn"
                        onClick={() => removeService(s.id)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {addOns.length > 0 && (
                <button
                  className="add-more-services-btn"
                  onClick={() => setShowAddService(true)}
                >
                  +add ons
                </button>
              )}
            </div>

            {/* ✅ BOOKING DETAILS ADDED */}
            {selectedDate && selectedTime && (
              <div className="booking-details">
                <p>
                  <strong>Booking:</strong>{" "}
                  {selectedDayName}, {selectedDate} {MONTHS[month]} {year} at {selectedTime}
                </p>
              </div>
            )}

            <div className="total-row">
              <span>Total Duration</span>
              <strong>{totalDurationMinutes} mins</strong>
            </div>

            <div className="total-row-premium">
              <span className="total-label">Total Amount</span>
              <div className="total-value-container">
                {originalTotalAmount > totalAmount && (
                  <span className="mrp-strikethrough">{currency}{originalTotalAmount}</span>
                )}
                <strong className="total-price-value">{currency}{totalAmount}</strong>
                <div className="offer-badge-box">
                  <span className="offer-badge">
                    {selectedServices[0]?.discount_label ||
                      (discountPercent > 0
                        ? `${discountPercent}% OFF`
                        : "SPECIAL OFFER")}
                  </span>
                </div>
              </div>
            </div>

            <button
              className="next-btn"
              disabled={!(selectedDate && selectedTime && selectedServices.length)}
              onClick={() =>
                navigate("/payment", {
                  state: {
                    services: selectedServices,
                    date: selectedDate,
                    time: selectedTime,
                    month,
                    year,
                    total: totalAmount,
                    duration: totalDurationMinutes,
                  },
                })
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY FOOTER */}
      <div className="mobile-booking-footer">
        <div className="mobile-footer-info">
          <div className="footer-total">{currency}{totalAmount}</div>
          <div className="footer-sub">{totalDurationMinutes} mins • {selectedServices.length} svc</div>
        </div>
        <button
          className="mobile-next-btn"
          disabled={!(selectedDate && selectedTime && selectedServices.length)}
          onClick={() =>
            navigate("/payment", {
              state: {
                services: selectedServices,
                date: selectedDate,
                time: selectedTime,
                month,
                year,
                total: totalAmount,
                duration: totalDurationMinutes,
              },
            })
          }
        >
          Next
        </button>
      </div>

      {/* ================= ADD-ONS MODAL ================= */}
      {showAddService && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-heading">Add Ons</h3>
              <button
                className="modal-close-inline"
                onClick={() => setShowAddService(false)}
              />
            </div>

            <div className="modal-scroll-content">
              <div className="addon-list-wrapper">
                {addOns.map((svc) => (
                  <div key={svc.id} className="addon-list-item">
                    <div className="addon-list-content">
                      <div className="summary-item-header">
                        <span className="service-name">{svc.title}</span>
                        <span className="service-time">
                          {formatDuration(svc.duration)}
                        </span>
                      </div>

                      <div className="summary-item-footer">
                        <div className="summary-price">
                          <span className="offer-price">
                            {getCurrency(svc.price)}{formatPrice(svc.price)}
                          </span>
                          {svc.original_price && (
                            <span className="mrp">
                              {getCurrency(svc.original_price)}{formatPrice(svc.original_price)}
                            </span>
                          )}
                        </div>

                        <div className="addon-list-actions">
                          <button
                            className="view-addon-btn"
                            onClick={() => {
                              setSelectedAddOn(svc);
                              setShowAddOnDetail(true);
                            }}
                          >
                            View
                          </button>

                          {selectedServices.find((s) => s.id === svc.id) ? (
                            <div className="quantity-control-small">
                              <button
                                className="qty-btn"
                                onClick={() => removeService(svc.id)}
                              >
                                -
                              </button>
                              <span className="qty-count">
                                {selectedServices.find((s) => s.id === svc.id).quantity}
                              </span>
                              <button
                                className="qty-btn"
                                onClick={() => addService(svc)}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              className="add-service-btn-small"
                              onClick={() => addService(svc)}
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="modal-continue-btn"
                onClick={() => setShowAddService(false)}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD-ON DETAIL MODAL ================= */}
      {showAddOnDetail && selectedAddOn && (
        <div className="modal-overlay">
          <div className="modal-container addon-detail-modal">
            <button
              className="modal-close"
              onClick={() => setShowAddOnDetail(false)}
            >
              <FiX size={18} />
            </button>

            <div className="modal-scroll-content">
              <div className="addon-detail-hero">
                <img src={selectedAddOn.image} alt={selectedAddOn.title} />
              </div>

              <div className="addon-detail-body">
                <h2 className="addon-detail-title">{selectedAddOn.title}</h2>
                <p className="addon-detail-meta">
                  {selectedAddOn.duration} mins • {selectedAddOn.service_type || "ADDITIONAL SERVICES"}
                </p>

                <div className="addon-detail-price-row">
                  {selectedAddOn.original_price && (
                    <span className="mrp">{getCurrency(selectedAddOn.original_price)}{formatPrice(selectedAddOn.original_price)}</span>
                  )}
                  <span className="offer-price">{getCurrency(selectedAddOn.price)}{formatPrice(selectedAddOn.price)}</span>
                </div>

                {selectedServices.find((s) => s.id === selectedAddOn.id) ? (
                  <div className="addon-detail-quantity">
                    <button className="qty-btn" onClick={() => removeService(selectedAddOn.id)}>-</button>
                    <span className="qty-count">
                      {selectedServices.find((s) => s.id === selectedAddOn.id).quantity}
                    </span>
                    <button
                      className="qty-btn"
                      onClick={() => addService(selectedAddOn)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    className="addon-add-btn"
                    onClick={() => addService(selectedAddOn)}
                  >
                    + Add to Booking
                  </button>
                )}

                <div className="addon-detail-info">
                  <h3>Description</h3>
                  <p>{selectedAddOn.description || `Neatify ${selectedAddOn.title} ensures a clean and fresh space.`}</p>

                  {selectedAddOn.work_includes && (
                    <>
                      <h3 className="work-includes-heading">Work Includes</h3>
                      <ul className="work-includes-list">
                        {(typeof selectedAddOn.work_includes === "string"
                          ? selectedAddOn.work_includes.split("\n")
                          : Array.isArray(selectedAddOn.work_includes)
                            ? selectedAddOn.work_includes
                            : []
                        ).map((item, i) => (
                          <li key={i}>{item.trim()}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {selectedAddOn.work_not_included && (
                    <>
                      <h3 className="work-not-included-heading">Work Not Included</h3>
                      <ul className="work-not-included-list">
                        {(typeof selectedAddOn.work_not_included === "string"
                          ? selectedAddOn.work_not_included.split("\n")
                          : Array.isArray(selectedAddOn.work_not_included)
                            ? selectedAddOn.work_not_included
                            : []
                        ).map((item, i) => (
                          <li key={i}>{item.trim()}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div style={{ paddingBottom: '30px' }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </>
  );
}