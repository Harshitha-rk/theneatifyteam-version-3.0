import { useEffect, useState, useMemo } from "react";
import { IoAlertCircleOutline, IoClose } from "react-icons/io5";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "../components/supabaseClient";
import { formatDuration } from "../utils/durationUtils";

import { FiArrowLeft } from "react-icons/fi";
import { useToast } from "../components/Toast/ToastContext";
import "./BookingDetails.css";

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

export default function BookingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const toast = useToast();

  const [booking, setBooking] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [loading, setLoading] = useState(true);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [review, setReview] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const [isEligibleToCancel, setIsEligibleToCancel] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showCancelledPopup, setShowCancelledPopup] = useState(false);

  const services = useMemo(() => {
    if (!booking?.services) return [];
    if (Array.isArray(booking.services)) return booking.services;
    if (typeof booking.services === "string") {
      try {
        return JSON.parse(booking.services);
      } catch {
        return [];
      }
    }
    return [];
  }, [booking?.services]);

  useEffect(() => {
    const fetchBooking = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (data) {
        setBooking(data);

        // ✅ ROBUST STAFF NAME FETCHING
        if (data.assigned_staff_email) {
          const fetchStaffName = async (email) => {
            try {
              // 1. Check staff_profile
              const { data: sProfile } = await supabase
                .from("staff_profile")
                .select("full_name")
                .eq("email", email)
                .maybeSingle();
              if (sProfile?.full_name) return sProfile.full_name;

              // 2. Check signup table
              const { data: sSignup } = await supabase
                .from("signup")
                .select("full_name")
                .eq("email", email)
                .maybeSingle();
              if (sSignup?.full_name) return sSignup.full_name;

              // 3. Fallback: Extract from email (ravi@gmail.com -> Ravi)
              const prefix = email.split("@")[0];
              return prefix.charAt(0).toUpperCase() + prefix.slice(1);
            } catch (err) {
              console.error("Staff fetch error:", err);
              return null;
            }
          };

          const name = await fetchStaffName(data.assigned_staff_email);
          if (name) setStaffName(name);
        } else {
          setStaffName("");
        }

        if (data.work_status?.toUpperCase() === "COMPLETED") {
          const { data: reviewData } = await supabase
            .from("reviews")
            .select("*")
            .eq("booking_id", data.id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (reviewData) {
            setReview(reviewData);
            setRating(reviewData.rating);
            setFeedbackText(reviewData.comment);
          }
        }
      }

      setLoading(false);
    };

    fetchBooking();
  }, [id]);

  /* CANCELLATION ELIGIBILITY */
  useEffect(() => {
    if (!booking?.id) return;

    const checkEligibility = async () => {
      const { data } = await supabase.rpc("check_cancellation_eligibility", {
        booking_uuid: booking.id,
      });

      setIsEligibleToCancel(!!data);
    };

    checkEligibility();
  }, [booking?.id]);

  /* CONFIRM CANCEL */
  const confirmCancellation = async () => {
    if (!cancelReason.trim()) {
      toast.warning("Please provide a reason.");
      return;
    }

    setCancelling(true);

    try {
      // Re-check eligibility
      const { data: eligible } = await supabase.rpc(
        "check_cancellation_eligibility",
        {
          booking_uuid: booking.id,
        }
      );

      if (!eligible) {
        toast.error("Cancellation window closed.");
        setCancelling(false);
        return;
      }

      const { error } = await supabase
        .from("bookings")
        .update({
          work_status: "CANCELLED",
          cancel_requested: true,
          cancel_reason: cancelReason,
          cancel_time: new Date().toISOString(),
          refund_status: "PENDING",
        })
        .eq("id", booking.id);

      if (error) throw error;

      setShowCancelModal(false);
      setShowCancelledPopup(true);
    } catch (err) {
      toast.error("Cancellation failed.");
      console.error(err);
    } finally {
      setCancelling(false);
    }
  };

  const openFeedbackModal = () => {
    setShowFeedbackModal(true);
  };

  const submitReview = async () => {
    if (!rating) {
      toast.warning("Please select a rating.");
      return;
    }

    setSubmittingReview(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("reviews")
          .update({
            rating,
            comment: feedbackText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("reviews").insert([
          {
            booking_id: booking.id,
            user_id: user.id,
            rating,
            comment: feedbackText,
          },
        ]);
      }

      setReview({
        rating,
        comment: feedbackText,
      });

      setShowFeedbackModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <p className="loading">Loading...</p>;
  if (!booking) return <p>No booking found</p>;

  const showCancelButton =
    booking.work_status !== "CANCELLED" &&
    booking.work_status !== "COMPLETED" &&
    booking.work_status !== "FAILED" &&
    (isEligibleToCancel || booking.cancel_requested === false);

  return (
    <>
      <Helmet>
        <title>Booking Details | The Neatify Team</title>
        <link rel="canonical" href={`https://www.theneatifyteam.in/booking-details/${id}`} />
      </Helmet>
      <div className="booking-details-container">
        <button className="back-btn-top" onClick={() => navigate("/my-bookings")}>
          <FiArrowLeft /> Back
        </button>

        <h2>Booking Details</h2>

        <p className="section">Customer Details</p>
        <div className="card">
          <p className="bold">{booking.customer_name}</p>
          <p>{booking.email}</p>
          <p>{booking.phone_number}</p>
        </div>

        <p className="section">Service Details</p>
        <div className="card">
          {services.map((s, i) => (
            <div key={i} className="service-row">
              <div>
                <p className="bold">{s.title || s.service_name}</p>
                <p>
                  {formatDuration(s.duration)}
                </p>
              </div>
              <p className="bold">{s.price}</p>
            </div>
          ))}
        </div>

        <p className="section">Schedule</p>
        <div className="card">
          <p>{booking.booking_date} at {booking.booking_time}</p>
        </div>

        <p className="section">Payment</p>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="bold">Total</p>
            <p className="bold">{services && services[0] ? getCurrency(services[0].price) : "₹"}{booking.total_amount}</p>
          </div>
          <p style={{ marginTop: '4px', fontSize: '14px', color: '#6b7280' }}>
            Status: {booking.payment_status || "pending"}
          </p>

          {/* INTEGRATED REFUND STATUS */}
          {booking.work_status === "CANCELLED" && (
            <div style={{
              fontSize: '13px',
              color: booking.refund_status === "REFUNDED" ? "#166534" : "#b91c1c",
              fontWeight: '600',
              marginTop: '8px',
              borderTop: '1px solid #f3f4f6',
              paddingTop: '8px'
            }}>
              {booking.refund_status === "REFUNDED"
                ? "✓ Refund Completed"
                : "⏳ Refund Pending (5–7 working days)"}
            </div>
          )}
        </div>

        {(booking.payment_status !== "failed" && booking.work_status?.toUpperCase() !== "CANCELLED" && booking.work_status?.toUpperCase() !== "FAILED" && booking.work_status?.toUpperCase() !== "COMPLETED") && (
          <>
            <p className="section">Staff Assignment</p>
            <div className="card">
              {booking.assigned_staff_email ? (
                <>
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: '600' }}>
                    <span>✓</span> Staff Assigned
                  </div>
                  <p className="bold">{staffName || "Loading..."}</p>
                  <p style={{ color: '#6b7280', fontSize: '14px' }}>{booking.assigned_staff_email}</p>

                  {/* OTP SECTION INSIDE STAFF CARD */}
                  <div className="otp-container" style={{ marginTop: '20px', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
                    <div className="otp-box">
                      <p className="otp-label">Start OTP</p>
                      <p className="otp-code">
                        {booking.startotp || "N/A"}
                      </p>
                      <p className="otp-subtext">Share with staff to start service</p>
                    </div>
                    <div className="otp-box">
                      <p className="otp-label">End OTP</p>
                      <p className="otp-code">
                        {booking.endotp || "N/A"}
                      </p>
                      <p className="otp-subtext">Share with staff after service</p>
                    </div>
                  </div>
                </>
              ) : (
                <p>Staff will be assigned shortly</p>
              )}
            </div>
          </>
        )}


        <div className="actions-container">
          {showCancelButton && (
            <button
              className="cancel-btn"
              onClick={() => setShowCancelModal(true)}
              disabled={cancelling}
            >
              ✕ Cancel Booking
            </button>
          )}
        </div>

        {showCancelModal && (
          <div className="modal-overlay">
            <div className="modal cancel-modal">
              <button
                className="modal-close-x"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
              >
                <IoClose />
              </button>

              <div className="modal-icon-cancel warning-icon-cancel">
                <IoAlertCircleOutline />
              </div>

              <h3>Cancel Booking?</h3>
              <p className="modal-subtitle-cancel">
                Are you sure you want to cancel this booking? This action cannot
                be undone.
              </p>

              <div className="form-group-cancel">
                <label className="modal-label-cancel">
                  Reason for cancellation
                </label>
                <textarea
                  placeholder="Please tell us why you're cancelling..."
                  className="modal-textarea-cancel"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              <div className="modal-actions-cancel">
                <button
                  className="secondary-btn-cancel"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                >
                  Keep Booking
                </button>

                <button
                  className="danger-btn-cancel"
                  onClick={confirmCancellation}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCancelledPopup && (
          <div className="modal-overlay">
            <div className="modal success-modal">
              <div className="modal-icon-success">
                <span className="checkmark-icon">✓</span>
              </div>
              <h3>Cancelled!</h3>
              <p className="modal-subtitle-success">
                Your booking has been cancelled successfully. Refund will be
                processed as per policy.
              </p>
              <button
                className="success-btn"
                onClick={() => navigate("/my-bookings")}
              >
                Back to My Bookings
              </button>
            </div>
          </div>
        )}

        {/* ===== FEEDBACK DISPLAY ===== */}
        {booking.work_status?.toUpperCase() === "COMPLETED" && (
          <div style={{ marginTop: "16px" }}>
            {review && (
              <div className="card">
                <p style={{ fontWeight: "600", marginBottom: "12px" }}>
                  Your Feedback
                </p>

                {/* TEXT FIRST */}
                <p
                  style={{
                    color: "#374151",
                    marginBottom: "14px",
                    lineHeight: "1.6",
                  }}
                >
                  {review.comment}
                </p>

                {/* RATING BELOW */}
                <div>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      style={{
                        color: star <= review.rating ? "#facc15" : "#e5e7eb",
                        fontSize: "20px",
                        marginRight: "4px",
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button className="edit-feedback-btn" onClick={openFeedbackModal}>
              {review ? "Edit Feedback" : "Give Feedback"}
            </button>
          </div>
        )}

        {/* ===== FEEDBACK MODAL ===== */}
        {showFeedbackModal && (
          <div
            className="modal-overlay"
            onClick={() => {
              if (rating === 1) {
                setRating(0); // 🔥 Only remove when exactly 1 star selected
              }
            }}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              {/* CLOSE X BUTTON */}
              <span
                className="modal-close-x"
                onClick={() => setShowFeedbackModal(false)}
              >
                ×
              </span>

              <h3>Rate Your Experience</h3>

              {/* TEXTAREA FIRST */}
              <textarea
                placeholder="Write your feedback..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />

              {/* RATING BELOW */}
              <div className="rating-stars" style={{ marginTop: "18px" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={star <= rating ? "star-active" : "star-inactive"}
                    onClick={() => {
                      if (rating === star) {
                        setRating(0); // toggle off
                      } else {
                        setRating(star);
                      }
                    }}
                  >
                    ★
                  </span>
                ))}
              </div>

              <div className="modal-actions">
                <button onClick={() => setShowFeedbackModal(false)}>
                  Cancel
                </button>

                <button onClick={submitReview} disabled={submittingReview}>
                  {submittingReview ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
