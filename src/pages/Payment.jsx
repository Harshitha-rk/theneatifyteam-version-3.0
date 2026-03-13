import { useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { Helmet } from "react-helmet-async";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import "./Payment.css";
import { supabase } from "../components/supabaseClient";
import { processPayment } from "../Services/PaymentService";
import Header from "../components/SampleHeader";
import { parseDurationToMinutes, formatDuration } from "../utils/durationUtils";

import { useToast } from "../components/Toast/ToastContext";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

const formatPrice = (value) => {
  if (value === 0 || value === "0") return "0";
  if (!value) return "";
  // If it's already a number, just return it
  if (typeof value === "number") return value;
  // If it's a string, strip the currency symbol
  return value.toString().replace(/^[^\d\s]+\s*/, "");
};

export default function Payment({ user }) {
  const location = useLocation();
  const navigate = useNavigate();

  const toast = useToast();

  let { services = [], date, time, month, year } = location.state || {};
  if (typeof services === "string") services = JSON.parse(services);

  const [selectedServices, setSelectedServices] = useState(services || []);
  const successProcessingRef = useRef(false);

  const currency = useMemo(() => {
    const firstService = selectedServices[0];
    return getCurrency(firstService?.price || firstService?.original_price);
  }, [selectedServices]);

  const fetchFreshData = useCallback(async () => {
    if (selectedServices.length === 0) return;

    const ids = selectedServices.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) return;

    const { data: servicesData } = await supabase
      .from("services")
      .select("*")
      .in("id", ids);

    const { data: addonsData } = await supabase
      .from("add_ons")
      .select("*")
      .in("id", ids);

    const freshMap = new Map();
    if (servicesData) servicesData.forEach((s) => freshMap.set(s.id, s));
    if (addonsData) addonsData.forEach((s) => freshMap.set(s.id, s));

    // Get claimed offer from session storage
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

    const updatedServices = selectedServices.map((s) => {
      const fresh = freshMap.get(s.id);
      if (fresh) {
        const isClaimed = claimedOffer && claimedOffer.serviceId === fresh.id;

        // 1. Check for active offer override in DB
        const matchingOffer = (offersData || []).find(o => o.title === fresh.title);

        // 2. Determine base price and discount from various sources
        let finalPrice = fresh.price;
        let finalDiscountPercent = parseFloat(fresh.discount_percent) || 0;
        let finalDiscountLabel = (fresh.discount_label ? fresh.discount_label.toUpperCase() : null) || (finalDiscountPercent > 0 ? `${finalDiscountPercent}% OFF` : null);

        if (isClaimed) {
          finalPrice = claimedOffer.offerPrice !== undefined ? claimedOffer.offerPrice : fresh.price;
          finalDiscountPercent = claimedOffer.offerPercentage;
          finalDiscountLabel = `${claimedOffer.offerPercentage}% OFF`;
        } else if (matchingOffer) {
          const offerPrice = matchingOffer.offer_price || matchingOffer.fixed_price;
          const offerPct = parseFloat(matchingOffer.offer_percentage) || 0;
          const originalPrice = fresh.original_price ? parseFloat(String(fresh.original_price).replace(/[^\d.]/g, "")) : null;

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
    });

    setSelectedServices(updatedServices);
  }, [selectedServices]);

  useEffect(() => {
    fetchFreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFreshData]);


  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [couponRemovedByUser, setCouponRemovedByUser] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [message, setMessage] = useState("");

  const [showPincodeAlert, setShowPincodeAlert] = useState(false);
  const [showPaymentFailAlert, setShowPaymentFailAlert] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const [criticalError, setCriticalError] = useState(null);

  const [acceptPolicies, setAcceptPolicies] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [loadingPolicy, setLoadingPolicy] = useState(false);

  const [isPaying, setIsPaying] = useState(false);
  const lockRef = useRef(false);
  const [paymentErrorMsg, setPaymentErrorMsg] = useState("");

  const [isPincodeServiceable, setIsPincodeServiceable] = useState(true);

  // Coupon State
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [couponStatus, setCouponStatus] = useState({ type: "", message: "" });

  const fetchPolicy = async (columnName, title) => {
    setModalTitle(title);
    setPolicyModalOpen(true);
    setLoadingPolicy(true);
    setModalContent("");

    try {
      const { data, error } = await supabase
        .from("app_policies")
        .select(columnName)
        .limit(1)
        .single();

      if (error) throw error;
      setModalContent(data?.[columnName] || "No content available.");
    } catch (err) {
      setModalContent(`Failed to load content. Error: ${err.message}`);
    } finally {
      setLoadingPolicy(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profile")
        .select("full_name,email,phone,address,pincode")
        .eq("id", user.id)
        .single();

      if (data) {
        setFirstName(data.full_name || "");
        setEmail(data.email || user.email || "");
        
        // Strip +91 from the phone number when loading for display
        const rawPhone = data.phone || "";
        const cleanPhone = rawPhone.replace(/\D/g, "");
        const displayPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
        
        setPhone(displayPhone);
        setProfilePhone(data.phone || ""); // Keep full phone for coupon logic comparison if needed
        setAddress(data.address || "");
        setZip(data.pincode || "");
      }
    };
    init();
  }, []);

  // Pincode serviceable check
  useEffect(() => {
    const checkPincode = async () => {
      if (!zip || zip.length !== 6) {
        setIsPincodeServiceable(false);
        return;
      }

      try {
        const { data } = await supabase
          .from("neatify_service_areas")
          .select("id")
          .eq("pincode", zip.trim())
          .limit(1);

        setIsPincodeServiceable(!!(data && data.length > 0));
      } catch (err) {
        console.error("Pincode check error:", err);
        setIsPincodeServiceable(false);
      } finally {
      }
    };

    checkPincode();
  }, [zip]);

  // ✅ Automatic Coupon Discovery
  useEffect(() => {
    const autoApplyCoupon = async () => {
      if (!phone || !profilePhone || appliedCoupon || isVerifyingCoupon || couponRemovedByUser) return;

      try {
        const cleanPhone = phone.replace(/\D/g, "").slice(-10);
        const cleanProfilePhone = profilePhone.replace(/\D/g, "").slice(-10);

        // Only look for coupons if the current phone matches the profile phone
        if (cleanPhone !== cleanProfilePhone) return;

        const { data } = await supabase
          .from("coupons")
          .select("*")
          .eq("phone_number", cleanPhone)
          .eq("is_used", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setAppliedCoupon(data);
          setCouponInput(data.coupon_code);
          setCouponStatus({
            type: "success",
            message: `Coupon automatically applied! ${data.discount_percentage}% discount`
          });
        }
      } catch (err) {
        console.error("Auto-coupon discovery failed:", err);
      }
    };

    autoApplyCoupon();
  }, [phone, profilePhone, appliedCoupon, isVerifyingCoupon, couponRemovedByUser]);

  // Clear coupon if phone number doesn't match profile or is cleared
  useEffect(() => {
    if (profilePhone) {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const cleanProfilePhone = profilePhone.replace(/\D/g, "").slice(-10);

      if ((!cleanPhone || cleanPhone !== cleanProfilePhone) && appliedCoupon) {
        setAppliedCoupon(null);
        setCouponInput("");
        setCouponStatus({ type: "", message: "" });
      }
    }
  }, [phone, profilePhone, appliedCoupon]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    // Keep couponInput as is (don't clear)
    setCouponStatus({ type: "", message: "Coupon disabled" });
    setCouponRemovedByUser(true);
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) {
      setCouponStatus({ type: "error", message: "Please enter a coupon code" });
      return;
    }

    if (!phone) {
      setCouponStatus({ type: "error", message: "Please enter your phone number first" });
      return;
    }

    setIsVerifyingCoupon(true);
    setCouponStatus({ type: "", message: "" });
    setCouponRemovedByUser(false); // ✅ User is manually attempting to apply, so reset removal flag

    try {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);

      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("coupon_code", couponInput.trim())
        .single();

      if (error || !data) {
        setCouponStatus({ type: "error", message: "Invalid coupon code" });
        setAppliedCoupon(null);
      } else if (data.is_used) {
        setCouponStatus({ type: "error", message: "This coupon has already been used" });
        setAppliedCoupon(null);
      } else if (data.phone_number.replace(/\D/g, "").slice(-10) !== cleanPhone) {
        setCouponStatus({ type: "error", message: "This coupon is not valid for your phone number" });
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
        setCouponStatus({ type: "success", message: `Coupon applied! ${data.discount_percentage}% discount` });
      }
    } catch (err) {
      console.error("Coupon error:", err);
      setCouponStatus({ type: "error", message: "Error verifying coupon. Try again." });
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  /* ================= FETCH TAXES ================= */
  const [globalTaxRate, setGlobalTaxRate] = useState(0);

  useEffect(() => {
    const fetchTaxes = async () => {
      try {
        const { data, error } = await supabase
          .from("taxes")
          .select("percent")
          .eq("is_active", true);

        if (error) {
          console.error("Error fetching taxes:", error);
          return;
        }

        if (data && data.length > 0) {
          const totalPercent = data.reduce((sum, row) => {
            const val = parseFloat(row.percent);
            return sum + (isNaN(val) ? 0 : val);
          }, 0);
          setGlobalTaxRate(totalPercent);
        }
      } catch (err) {
        console.error("Tax fetch exception:", err);
      }
    };
    fetchTaxes();
  }, []);

  // Helper to safely parse price strings like "₹ 499.00" or numbers
  const parsePrice = (price) => {
    if (!price) return 0;
    const clean = String(price).replace(/[^\d.]/g, ""); // Keep digits and dot
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const totalAmount = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + parsePrice(s.price);
    }, 0);
  }, [selectedServices]);

  const totalOriginalAmount = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + parsePrice(s.original_price);
    }, 0);
  }, [selectedServices]);

  const totalDurationMins = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + (parseDurationToMinutes(s.duration) * (s.quantity || 1));
    }, 0);
  }, [selectedServices]);

  const totalTax = useMemo(() => {
    // Use Global Tax fetched from 'taxes' table in Supabase
    if (globalTaxRate > 0) {
      return (totalAmount * globalTaxRate) / 100;
    }
    // Fallback: per-service 'tax_percent' column
    return selectedServices.reduce((sum, s) => {
      const price = parsePrice(s.price);
      const taxRate = parseFloat(s.tax_percent) || 0;
      return sum + (price * taxRate) / 100;
    }, 0);
  }, [selectedServices, totalAmount, globalTaxRate]);

  const finalSubtotal = totalAmount;
  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    return (finalSubtotal * (parseFloat(appliedCoupon.discount_percentage) || 0)) / 100;
  }, [appliedCoupon, finalSubtotal]);

  const totalAmountAfterCoupon = finalSubtotal - couponDiscount;
  const finalTotalAmount = totalAmountAfterCoupon + totalTax;

  /* ================= PAYMENT + BOOKING ================= */

  const handlePlaceOrderAndPay = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    if (!firstName || !email || !phone || !address || !city || !zip) {
      toast.warning("Please fill all required fields.");
      lockRef.current = false;
      return;
    }

    if (phone.replace(/\D/g, "").length !== 10) {
      toast.warning("Phone number must be exactly 10 digits.");
      lockRef.current = false;
      return;
    }

    if (!isPincodeServiceable) {
      toast.error("Service Unavailable: Service is not available in your area yet. We are expanding soon!");
      lockRef.current = false;
      return;
    }

    if (!acceptPolicies || !agreeTerms) {
      toast.warning(
        "Please accept the User Policies & Terms & Conditions to proceed.",
      );
      lockRef.current = false;
      return;
    }

    if (isPaying) {
      lockRef.current = false;
      return;
    }
    setIsPaying(true);

    try {
      // ✅ AUTH CHECK (Moved to top)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsPaying(false);
        lockRef.current = false;
        toast.error("Please login to proceed.");
        return;
      }

      /* ✅ BACKWARD SYNC (ALWAYS UPDATE FIRST) */

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const formattedPhone = `+91${cleanPhone}`;

      await supabase
        .from("profile")
        .update({
          full_name: firstName,
          phone: formattedPhone,
          address: address,
          pincode: zip,
          email: email,
        })
        .eq("id", user.id);

      await supabase
        .from("signup")
        .update({
          full_name: firstName,
          phone: formattedPhone,
          email: email,
        })
        .eq("id", user.id);

      await supabase.auth.updateUser({
        data: {
          display_name: firstName,
          full_name: firstName,
          phone_number: formattedPhone,
        },
      });

      /* 1️⃣ PINCODE CHECK */
      const { data: pincodeData } = await supabase
        .from("neatify_service_areas")
        .select("id")
        .eq("pincode", zip.trim())
        .limit(1);

      if (!pincodeData || pincodeData.length === 0) {
        setIsPaying(false);
        lockRef.current = false;
        setShowPincodeAlert(true);
        return;
      }

      /* 2️⃣ CREATE PENDING BOOKING */
      let formattedDate = "";
      if (year && month !== undefined && date) {
        formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      } else {
        formattedDate = new Date().toISOString().split("T")[0];
      }

      const bookingData = {
        user_id: user.id,
        customer_name: firstName,
        email: email,
        phone_number: formattedPhone,
        full_address: `${address}, ${city}, ${zip}`,
        services: selectedServices,
        booking_date: formattedDate,
        booking_time: time || "Not specified",
        total_amount: Number(finalTotalAmount.toFixed(2)),
        payment_status: "pending", // Initial status
        payment_verified: false,
        payment_method: "razorpay",
        work_status: "PENDING",
        // ✅ Pre-fill coupon info in case payment fails or for immediate record
        coupon_code: appliedCoupon ? appliedCoupon.coupon_code : null,
        coupon_discount_percentage: appliedCoupon ? appliedCoupon.discount_percentage : 0,
        coupon_discount_amount: Number(couponDiscount.toFixed(2)),
      };

      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .insert([bookingData])
        .select()
        .single();

      if (bookingError || !bookingRow) {
        setIsPaying(false);
        lockRef.current = false;
        console.error("Booking creation failed:", bookingError);
        toast.error("Failed to create booking. Please try again.");
        return;
      }

      const bookingId = bookingRow.id;

      /* 3️⃣ PROCESS PAYMENT */
      const paymentResult = await processPayment(finalTotalAmount, {
        firstName,
        lastName: "",
        email,
        phone: formattedPhone,
      }, bookingId);

      if (!paymentResult.success) {
        setIsPaying(false);
        // Update booking to failed
        await supabase
          .from("bookings")
          .update({
            payment_status: "failed",
            work_status: "FAILED"
          })
          .eq("id", bookingId);

        if (paymentResult.error !== "DISMISSED") {
          setPaymentErrorMsg(paymentResult.error || "Unknown Error");
          setShowPaymentFailAlert(true);
        } else {
          // If the user just dismissed the Razorpay modal, still show them their bookings
          navigate("/my-bookings");
        }
        lockRef.current = false;
        return;
      }

      /* 4️⃣ SUCCESS - Store payment data temporarily (will save when user clicks OK) */
      setPendingBookingData({
        bookingId,
        paymentResult,
        appliedCoupon,
        couponDiscount
      });

      // ✅ Show success alert - user will click OK to confirm and save
      setShowSuccessAlert(true);

    } catch (err) {
      console.error("Order flow error:", err);
      setShowPaymentFailAlert(true);
    } finally {
      setIsPaying(false);
      lockRef.current = false;
    }
  };

  /* ================= UI ================= */

  return (
    <>
      <Helmet>
        <title>Payment | The Neatify Team | Cleaning Services in Hyderabad</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/payment" />
      </Helmet>
      <Header user={user} />

      {isPaying && (
        <div style={overlayStyle}>
          <div
            style={{
              background: "#fff",
              padding: "24px 30px",
              borderRadius: "12px",
              fontWeight: "bold",
            }}
          >
            Processing Payment...
          </div>
        </div>
      )}

      {showPincodeAlert && (
        <Modal
          title="Service Unavailable"
          text="Service is not available in your area yet. We are expanding soon!"
          onClose={() => setShowPincodeAlert(false)}
        />
      )}

      {showPaymentFailAlert && (
        <Modal
          title="Payment Failed"
          text={paymentErrorMsg || "Payment was not successful. Please try again."}
          onClose={() => {
            setShowPaymentFailAlert(false);
            navigate("/my-bookings");
          }}
        />
      )}

      {criticalError && (
        <Modal
          title="⚠️ Booking Error"
          text={`PAYMENT SUCCESSFUL, BUT BOOKING FAILED. \n\nPayment ID: ${criticalError.paymentId} \n\nPlease take a screenshot and contact support immediately.`}
          onClose={() => setCriticalError(null)}
          isCritical={true}
        />
      )}

      {showSuccessAlert && (
        <Modal
          title="Booking Successful!"
          text="Your booking has been placed and payment verified. You can view it in My Bookings."
          onClose={async () => {
            if (successProcessingRef.current) return;
            successProcessingRef.current = true;

            console.log("✅ Success modal closed, pendingBookingData:", pendingBookingData);
            setShowSuccessAlert(false); // Hide immediately to prevent double clicks

            if (pendingBookingData) {
              const { appliedCoupon } = pendingBookingData;

              try {
                // Mark coupon as used
                if (appliedCoupon) {
                  const { error: couponError } = await supabase
                    .from("coupons")
                    .update({ is_used: true })
                    .eq("id", appliedCoupon.id);

                  if (couponError) {
                    console.error("❌ Coupon update failed:", couponError);
                  } else {
                    console.log("✅ Coupon marked as used:", appliedCoupon.coupon_code);
                  }
                }
                // MARKER: Manual email calls removed. 
                // Emails (Confirmation & Invoice) are handled by Supabase Edge Functions to prevent duplicates.
              } catch (err) {
                console.error("❌ Error in success handler:", err);
              }
            } else {
              console.warn("⚠️ pendingBookingData is null - booking may not be saved");
            }

            // Wait a moment for real-time sync before navigating
            setTimeout(() => {
              setPendingBookingData(null);
              navigate("/my-bookings");
            }, 1000);
          }}
        />
      )}

      {policyModalOpen && (
        <PolicyModal
          title={modalTitle}
          content={modalContent}
          loading={loadingPolicy}
          onClose={() => setPolicyModalOpen(false)}
        />
      )}

      <div className="payment-container">
        <button className="back-btn-circle" onClick={() => navigate(-1)} title="Back">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="page-title">Booking Form</h1>

        <div className="main-row">
          <div className="left">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name *"
            />
            <input value={email} disabled />
            <div className="payment-phone-input-wrapper">
              <span className="payment-phone-prefix">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 10) setPhone(val);
                }}
                placeholder="Phone Number *"
                className="payment-phone-input-with-prefix"
              />
            </div>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address *"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City *"
            />
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="Zip *"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message (Optional)"
            />
          </div>

          <div className="right">
            <h3 className="section-title">Service Details</h3>

            <div className="services-wrapper">
              {selectedServices.map((s, i) => (
                <div key={i} className="service-item">
                  <strong className="service-item-title">{s.title || s.name}</strong>
                  <div className="service-item-price-row">
                    {s.original_price && (
                      <span className="mrp">
                        {getCurrency(s.original_price)}{formatPrice(s.original_price)}
                      </span>
                    )}
                    <span className="service-item-price">
                      {getCurrency(s.price)}{formatPrice(s.price)}
                    </span>
                    {(s.discount_percent > 0 || s.discount_label) && (
                      <span className="offer-badge">
                        {s.discount_label ||
                          (s.discount_percent > 0
                            ? `${s.discount_percent}% OFF`
                            : "SPECIAL OFFER")}
                      </span>
                    )}
                  </div>
                  <p className="service-item-duration">
                    {formatDuration(s.duration)}
                  </p>
                  <p className="service-item-date">
                    {date} {MONTHS[month]} {year} at {time}
                  </p>
                </div>
              ))}
            </div>

            <div className="summary-bottom">
              <div className="coupon-section">
                <h4 className="coupon-title">Have a coupon code?</h4>
                <div className="coupon-input-group">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className="coupon-input"
                    disabled={isVerifyingCoupon}
                  />
                  <button
                    className={appliedCoupon ? "coupon-remove-btn" : "coupon-apply-btn"}
                    onClick={appliedCoupon ? handleRemoveCoupon : handleApplyCoupon}
                    disabled={isVerifyingCoupon || (!appliedCoupon && !couponInput.trim())}
                  >
                    {isVerifyingCoupon ? "..." : (appliedCoupon ? "Remove" : "Apply")}
                  </button>
                </div>
                {couponStatus.message && (
                  <p className={`coupon-status ${couponStatus.type}`}>
                    {couponStatus.message}
                  </p>
                )}
              </div>
              <div className="total-row">
                <span>Total Duration</span>
                <strong>
                  {totalDurationMins} mins
                </strong>
              </div>

              <div className="total-row">
                <span>Subtotal</span>
                <strong>{currency}{totalAmount}</strong>
              </div>

              {appliedCoupon && (
                <div className="total-row coupon-row">
                  <span>Coupon Discount ({appliedCoupon.discount_percentage}%)</span>
                  <strong className="discount-value">-{currency}{couponDiscount.toFixed(2)}</strong>
                </div>
              )}

              <div className="total-row">
                <span>Tax (GST)</span>
                <strong>{currency}{totalTax.toFixed(2)}</strong>
              </div>

              <div className="total-row-premium">
                <span className="total-label">Total Amount</span>
                <div className="total-value-container">
                  {totalOriginalAmount > totalAmount && (
                    <span className="mrp-strikethrough">{currency}{totalOriginalAmount}</span>
                  )}
                  <strong className="total-price-value">{currency}{finalTotalAmount.toFixed(2)}</strong>
                  <div className="offer-badge-box">
                    {(selectedServices[0]?.discount_percent > 0 ||
                      selectedServices[0]?.discount_label) && (
                        <span className="offer-badge">
                          {(selectedServices[0].discount_label ||
                            (selectedServices[0].discount_percent > 0
                              ? `${selectedServices[0].discount_percent}% OFF`
                              : "SPECIAL OFFER")).toUpperCase()}
                        </span>
                      )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "18px" }}>
                <label
                  style={{ display: "flex", gap: "10px", marginBottom: "8px" }}
                >
                  <input
                    type="checkbox"
                    checked={acceptPolicies}
                    onChange={(e) => setAcceptPolicies(e.target.checked)}
                  />
                  <span>
                    I accept the{" "}
                    <span
                      className="policy-link"
                      onClick={() =>
                        fetchPolicy("user_policies", "User Policies")
                      }
                    >
                      User Policies
                    </span>
                  </span>
                </label>

                <label style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <span
                      className="policy-link"
                      onClick={() =>
                        fetchPolicy(
                          "terms_and_conditions",
                          "Terms & Conditions",
                        )
                      }
                    >
                      Terms & Conditions
                    </span>
                  </span>
                </label>
              </div>

              <button
                className="primary-btn"
                onClick={handlePlaceOrderAndPay}
                disabled={!acceptPolicies || !agreeTerms || isPaying}
              >
                {isPaying ? "Processing Payment..." : "Place Order & Pay"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY FOOTER */}
      <div className="mobile-payment-footer">
        <div>
          <div className="footer-total">{currency}{finalTotalAmount.toFixed(2)}</div>
          {appliedCoupon && <div className="footer-discount">Saved {currency}{couponDiscount.toFixed(2)}</div>}
          <div className="footer-sub">Total Amount</div>
        </div>
        <button
          className="mobile-primary-btn"
          onClick={handlePlaceOrderAndPay}
          disabled={!acceptPolicies || !agreeTerms || isPaying}
        >
          {isPaying ? "Processing..." : "Pay Now"}
        </button>
      </div>
    </>
  );
}

/* ===== MODAL ===== */
function Modal({ title, text, onClose, isCritical }) {
  const [disabled, setDisabled] = useState(false);

  return (
    <div style={overlayStyle}>
      <div
        style={{ ...cardStyle, border: isCritical ? "2px solid red" : "none" }}
      >
        <h3 style={{ color: isCritical ? "red" : "black" }}>
          {title || "Confirm"}
        </h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
        <button
          style={{ ...okBtnStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
          disabled={disabled}
          onClick={() => {
            setDisabled(true);
            onClose();
          }}
        >
          {disabled ? "..." : "OK"}
        </button>
      </div>
    </div>
  );
}

/* ===== POLICY MODAL ===== */
function PolicyModal({ title, content, loading, onClose }) {

  return (
    <div className="policy-overlay">
      <div className="policy-modal">
        <div className="policy-header">
          <h2>{title}</h2>
          <button className="policy-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="policy-body">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="policy-content">
              {(() => {
                if (!content) return null;
                // Split content into points based on " - " or leading "- "
                const points = content
                  .split(/\s-\s|^-\s|^-/)
                  .map((p) => p.trim())
                  .filter(Boolean);

                if (points.length > 1) {
                  return (
                    <ul className="policy-list">
                      {points.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  );
                }
                // Fallback for non-bulleted content
                return <div dangerouslySetInnerHTML={{ __html: content }} />;
              })()}
            </div>
          )}
        </div>
        <div className="policy-footer">
          <button className="policy-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const cardStyle = {
  background: "#fff",
  padding: "30px",
  borderRadius: "12px",
  width: "380px",
  textAlign: "center",
};

const okBtnStyle = {
  marginTop: "20px",
  padding: "10px 28px",
  background: "#f4c430",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  cursor: "pointer",
};