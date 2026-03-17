import { useEffect, useMemo, useState, useCallback } from "react";

import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FiShare2, FiArrowLeft, FiX } from "react-icons/fi";
import { Helmet } from "react-helmet-async"; // ✅ Import Helmet-Async
import { supabase } from "../components/supabaseClient";
import Header from "../components/SampleHeader";
import PageLoader from "../components/PageLoader";
import { useToast } from "../components/Toast/ToastContext";
import { formatDuration } from "../utils/durationUtils";
import { calculateServicePrice } from "../utils/priceUtils";
import "./ServiceDetail.css";

export default function ServiceDetail({ user }) {

  const { state } = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [fetchedService, setFetchedService] = useState(null);
  const [allServices, setAllServices] = useState(state?.allServices || []);
  const [isFetching, setIsFetching] = useState(!state?.service);
  const [error, setError] = useState(null);

  const service = state?.service || fetchedService;

  const [showSummary, setShowSummary] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddOnDetail, setShowAddOnDetail] = useState(false);
  const [selectedAddOn, setSelectedAddOn] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const toast = useToast();

  // ✅ Prevent body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showSummary || showAddService || showAddOnDetail;
    if (isAnyModalOpen) {
      document.body.classList.add("no-scroll");
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => document.body.classList.remove("no-scroll");
  }, [showSummary, showAddService, showAddOnDetail]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        // Omitting 'text' sometimes forces apps to show the link-preview card instead of plain text
        await navigator.share({
          title: service?.title,
          url: window.location.href,
        });
      } else {
        // Desktop fallback: Keep the text for copy-paste convenience
        const shareText = `Check out ${service?.title} on Neatify!\n${window.location.href}`;
        await navigator.clipboard.writeText(shareText);
        toast.success("Link copied to clipboard!");
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  const getAbsoluteImageUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  /* ================= FETCH SERVICE IF MISSING ================= */


  /* ✅ DEEP LINK REDIRECT LOGIC */
  useEffect(() => {
    // Attempt to open in app on page load if it's a direct entry
    if (id && !state?.service) {
      const appUrl = `neatifynation://service/${id}`;

      // Create a hidden iframe to attempt opening the app
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = appUrl;
      document.body.appendChild(iframe);

      // Clean up iframe after attempt
      const timer = setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);

      return () => {
        clearTimeout(timer);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };
    }
  }, [id, state?.service]);

  const fetchServiceById = useCallback(async (serviceId) => {
    try {
      setIsFetching(true);

      // 1. Fetch the service
      let { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("slug", serviceId)
        .maybeSingle();

      if (!data) {
        ({ data, error } = await supabase
          .from("services")
          .select("*")
          .eq("id", serviceId)
          .maybeSingle());
      }

      if (error) throw error;
      if (!data) throw new Error("Service not found");

      // 2. Fetch ALL services (for the Header search to be consistent)
      const { data: allServicesData } = await supabase.from("services").select("*");

      // 3. Fetch active offers
      const { data: offersData } = await supabase
        .from("offers")
        .select("*")
        .eq("is_offer_enabled", true)
        .order("created_at", { ascending: false });

      const claimedOffer = JSON.parse(sessionStorage.getItem("claimedOffer") || "null");

      // 4. Transform main service
      const pricing = calculateServicePrice(data, offersData, claimedOffer);
      const mergedService = {
        ...data,
        price: pricing.price,
        discount_percent: pricing.discount_percent,
        discount_label: pricing.discount_label
      };

      // 5. Transform all services for Header (so search prices are also correct)
      const transformedAll = (allServicesData || []).map(s => {
        const p = calculateServicePrice(s, offersData, claimedOffer);
        return { ...s, price: p.price, discount_percent: p.discount_percent, discount_label: p.discount_label };
      });

      setFetchedService(mergedService);
      // We'll store transformedAll in a new state to pass to Header
      setAllServices(transformedAll);
    } catch (err) {
      console.error("Error fetching service:", err);
      setError(true);
    } finally {
      setIsFetching(false);
    }
  }, []);

  /* ================= FETCH SERVICE IF MISSING ================= */
  useEffect(() => {
    if (!state?.service && id) {
      fetchServiceById(id);
    }
  }, [id, state?.service, fetchServiceById]);

  /* ✅ DISABLE ADD-ONS FOR DEEP CLEANING */
  const isDeepCleaning =
    service?.service_type?.toLowerCase() === "deep cleaning";

  /* CURRENCY & PRICE FORMATTER */
  const getCurrency = (value) => {
    if (!value) return "₹"; // Fallback
    const match = String(value).match(/^([^\d\s]+)/);
    return match ? match[1] : "₹";
  };

  const formatPrice = (value) => {
    if (value === 0 || value === "0") return "0";
    if (!value) return "";
    return value.toString().replace(/^[^\d\s]+\s*/, "");
  };

  const currency = useMemo(() => getCurrency(service?.price || service?.original_price), [service]);

  /* ================= CLAIMED OFFER LOGIC ================= */
  const claimedOffer = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("claimedOffer");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Only apply if it's the same service
      if (parsed.serviceId === service?.id) {
        return parsed;
      }
    } catch (e) {
      console.error("Error parsing claimedOffer:", e);
    }
    return null;
  }, [service]);

  // Use the claimed offer price if it exists, otherwise calculate from original_price if a discount exists
  const displayPrice = useMemo(() => {
    if (claimedOffer && claimedOffer.offerPrice !== undefined && claimedOffer.offerPrice !== null) {
      return claimedOffer.offerPrice;
    }
    return service?.price;
  }, [claimedOffer, service]);

  /* ================= FETCH ADD ONS ================= */
  useEffect(() => {
    if (!service) return;

    supabase
      .from("add_ons")
      .select(
        "id, title, duration, price, original_price, discount_percent, image, work_includes, description, work_not_included, service_type, max_quantity"
      )
      .eq("service_type", service.service_type?.toUpperCase())
      .not("image", "is", null)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setAddOns(data);
        }
      });
  }, [isDeepCleaning, service]);

  /* ================= INIT MAIN SERVICE ================= */
  useEffect(() => {
    if (service) {
      const isClaimed = claimedOffer && claimedOffer.serviceId === service.id;

      // Calculate offer price from MRP if claimed or if native discount exists
      // originalPrice and discountPercent removed as they were unsued here
      setSelectedServices([
        {
          id: service.id,
          title: service.title,
          duration: service.duration,
          // Apply claimed offer price if applicable, otherwise use calculated/base price
          price: isClaimed && claimedOffer.offerPrice !== undefined ? claimedOffer.offerPrice : service.price,
          original_price: service.original_price,
          // Apply claimed offer percentage
          discount_percent: isClaimed ? claimedOffer.offerPercentage : service.discount_percent,
          discount_label: isClaimed ? `${claimedOffer.offerPercentage}% OFF` : (service.discount_label ? service.discount_label.toUpperCase() : null),
          image: service.image,
          work_includes: service.work_includes,
          quantity: 1,
        },
      ]);
    }
  }, [service, claimedOffer]);

  /* ================= ADD ADD-ON ================= */
  const addService = (svc) => {
    if (isDeepCleaning) return;

    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (existing) {
        // Enforce max_quantity if it exists
        const limit = existing.max_quantity || 100;
        if (existing.quantity >= limit) {
          toast.error(`You can only add up to ${limit} of this service.`);
          return prev;
        }

        return prev.map((s) =>
          s.id === svc.id ? { ...s, quantity: (s.quantity || 1) + 1 } : s
        );
      }
      // Calculate price from MRP if discount exists
      const originalPrice = svc.original_price ? parseFloat(String(svc.original_price).replace(/[^\d.]/g, "")) : null;
      const discountPercent = parseFloat(svc.discount_percent) || 0;
      const calculatedPrice = (originalPrice && discountPercent > 0)
        ? Math.round(originalPrice * (1 - discountPercent / 100))
        : svc.price;

      return [
        ...prev,
        {
          ...svc,
          price: calculatedPrice,
          quantity: 1,
        },
      ];
    });

    // setShowAddService(false); // ✅ Keep it open to allow multi-add
    // setShowToast(true); // User wants to see toast or keep summary open?
    // setShowSummary(true);
  };

  /* ✅ REMOVE ADD-ON (OR DECREMENT) */
  const removeService = (id) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (existing && existing.quantity > 1) {
        return prev.map((s) =>
          s.id === id ? { ...s, quantity: s.quantity - 1 } : s
        );
      }
      // If it's the main service, don't remove (though technically remove-btn is hidden for it)
      if (id === service?.id) return prev;
      return prev.filter((s) => s.id !== id);
    });
  };

  const descriptionLines = useMemo(() => {
    if (!service) return [];
    return (service.description || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim());
  }, [service]);

  const workIncludesLines = useMemo(() => {
    if (!service?.work_includes) return [];
    return service.work_includes
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim());
  }, [service]);

  const workNotIncludedLines = useMemo(() => {
    if (!service?.work_not_included) return [];
    return service.work_not_included
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim());
  }, [service]);

  if (isFetching) return <PageLoader />;

  if (!service || error) {
    return (
      <>
        <Header user={user} allServices={allServices} />
        <div className="not-found-container">
          <div className="not-found-icon">🏷️</div>
          <h2>Service Not Found</h2>
          <p>The service you are looking for might have been moved or deleted.</p>
          <button className="back-btn" onClick={() => navigate("/services")}>
            Back to Services
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ✅ Open Graph Tags for WhatsApp/Social Sharing */}
      {service && (
        <Helmet>
          <title>{service.title} | The Neatify Team | Cleaning Services in Hyderabad</title>
          <meta name="description" content={service.description} />
          <meta property="og:title" content={service.title} />
          <meta property="og:description" content={service.description} />
          <meta property="og:image" content={getAbsoluteImageUrl(service.image)} />
          <link rel="canonical" href={window.location.href} />
          <meta property="og:url" content={window.location.href} />
          <meta property="og:type" content="website" />
          <script type="application/ld+json">
            {`
              {
                "@context": "https://schema.org",
                "@type": "Service",
                "name": "${service.title}",
                "description": "${service.description?.replace(/"/g, '\\"')}",
                "provider": {
                  "@type": "LocalBusiness",
                  "name": "The Neatify Team"
                },
                "areaServed": "Hyderabad",
                "offers": {
                  "@type": "Offer",
                  "price": "${service.price}",
                  "priceCurrency": "INR"
                }
              }
            `}
          </script>
          <script type="application/ld+json">
            {`
              {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                  {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": "https://www.theneatifyteam.in/"
                  },
                  {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Services",
                    "item": "https://www.theneatifyteam.in/services"
                  },
                  {
                    "@type": "ListItem",
                    "position": 3,
                    "name": "${service.title}",
                    "item": "${window.location.href}"
                  }
                ]
              }
            `}
          </script>
        </Helmet>
      )}

      <Header user={user} allServices={allServices} />

      <div className="detail-page">
        {!showSummary && !showAddService && (
          <button className="back-btn-circle" onClick={() => navigate("/services", { state: { fromDetail: true, lastCategory: state?.lastCategory } })}>
            <FiArrowLeft size={20} />
          </button>
        )}

        <img src={service.image} alt={service.title} className="hero-image" />

        <div className="detail-content">
          <h1>{service.title}</h1>

          <div className="price-row">
            <span className="duration">{service.duration}</span>
            <span className="dot">•</span>

            {service.original_price && (
              <span className="mrp">
                {currency}{formatPrice(service.original_price)}
              </span>
            )}
            
            <span className="offer-price">
              {currency}{formatPrice(displayPrice)}
            </span>

            <span className="offer-badge">
              {claimedOffer
                ? `${claimedOffer.offerPercentage}% OFF`
                : (service.discount_label || (service.discount_percent > 0 ? `${service.discount_percent}% OFF` : "SPECIAL OFFER"))
              }
            </span>
          </div>

          <div className="actions">
            <button className="primary" onClick={() => setShowSummary(true)}>
              Book Now
            </button>
            <button className="secondary share-btn" onClick={handleShare} title="Share">
              <FiShare2 size={20} />
            </button>
          </div>

          {descriptionLines.length > 0 && <h3>Description</h3>}
          {descriptionLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}

          {workIncludesLines.length > 0 && (
            <>
              <h3 className="work-includes-heading">Work Includes</h3>
              <ul className="work-includes">
                {workIncludesLines.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}

          {workNotIncludedLines.length > 0 && (
            <>
              <h3 className="work-not-included-heading">Work Not Includes</h3>
              <ul className="work-not-included">
                {workNotIncludedLines.map((item, i) => (
                  <li key={i} className="excluded-item">{item}</li>
                ))}
              </ul>
            </>
          )}

          {Array.isArray(service.gallery_images) &&
            service.gallery_images.length > 0 && (
              <>
                <h3 className="gallery-title">Workframes</h3>
                <div className="gallery">
                  {service.gallery_images.map((img, i) => (
                    <img key={i} src={img} alt="" />
                  ))}
                </div>
              </>
            )}
        </div>

        {/* ================= SUMMARY MODAL ================= */}
        {showSummary && (
          <div className="modal-overlay">
            <div className="modal-container">
              <button
                className="modal-close"
                onClick={() => setShowSummary(false)}
              />

              <h2 className="modal-title">Appointment Summary</h2>

              <div className="modal-scroll-content">
                {selectedServices.map((s) => (
                  <div key={s.id} className="summary-item">
                    <div className="summary-item-content">
                      <div className="summary-item-header">
                        <span className="service-name">{s.title}</span>
                        <span className="service-time">
                          {formatDuration(s.duration)}
                        </span>
                      </div>

                      <div className="summary-item-footer">
                        <div className="summary-price">
                          {s.original_price && (
                            <span className="mrp">
                              {getCurrency(s.original_price)}{formatPrice(s.original_price)}
                            </span>
                          )}
                          <span className="offer-price">
                            {getCurrency(s.price)}{formatPrice(s.price)}
                          </span>
                          <span className="offer-badge">
                            {s.discount_label ||
                              (s.discount_percent > 0
                                ? `${s.discount_percent}% OFF`
                                : "5% OFF")}
                          </span>
                        </div>

                        {s.id !== service.id && (
                          <button
                            className="remove-btn"
                            onClick={() => removeService(s.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                {addOns.length > 0 && (
                  <button
                    className="add-service-btn"
                    onClick={() => {
                      setShowSummary(false);
                      setShowAddService(true);
                    }}
                  >
                    + Add-ons
                  </button>
                )}

                <button
                  className="schedule-btn"
                  onClick={() =>
                    navigate("/booking", { state: { services: selectedServices } })
                  }
                >
                  Schedule Appointment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= ADD-ONS MODAL ================= */}
        {!isDeepCleaning && showAddService && (
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
                {addOns.map((svc) => (
                  <div key={svc.id} className="addon-list-item">
                    <div className="addon-list-content">
                      <div className="summary-item-header">
                        <span className="service-name">{svc.title}</span>
                        <span className="service-time">{svc.duration} mins</span>
                      </div>

                      <div className="summary-item-footer">
                        <div className="summary-price">
                          {svc.original_price && (
                            <span className="mrp">
                              {getCurrency(svc.original_price)}{formatPrice(svc.original_price)}
                            </span>
                          )}
                          <span className="offer-price">
                            {getCurrency(svc.price)}{formatPrice(svc.price)}
                          </span>
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

              <div className="modal-footer">
                <button
                  className="modal-continue-btn"
                  onClick={() => {
                    setShowAddService(false);
                    setShowSummary(true);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= ADD-ON DETAIL MODAL — NEW ================= */}
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
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </>
  );
}
