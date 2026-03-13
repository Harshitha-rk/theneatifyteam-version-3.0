import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";
import { Helmet } from "react-helmet-async";

import { useToast } from "../components/Toast/ToastContext";
import { useConfirm } from "../components/ConfirmModal/ConfirmModal";
import { FiUser, FiMail, FiPhone, FiMapPin, FiHash, FiLogOut, FiCalendar, FiPhoneCall, FiArrowLeft, FiEdit2, FiSave, FiX, FiCheckCircle } from "react-icons/fi";
import bgImage from "../components/Background-Image.png";
import "./Profile.css";

export default function Profile() {
  const navigate = useNavigate();

  const toast = useToast();
  const { confirm } = useConfirm();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ================= LOAD PROFILE ================= */
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // ✅ FIXED: Use getSession instead of getUser
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          navigate("/login");
          return;
        }

        const user = session.user;

        const { data } = await supabase
          .from("profile")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (data) {
          setFullName(data.full_name || "");
          setEmail(data.email || user.email || "");
          const rawPhone = data.phone || user.phone || "";
          const cleanPhone = rawPhone.replace(/\D/g, "");
          setPhone(cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone);
          setAddress(data.address || "");
          setPincode(data.pincode || "");
        } else {
          setEmail(user.email || "");
          const rawPhone = user.phone || "";
          const cleanPhone = rawPhone.replace(/\D/g, "");
          setPhone(cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone);
        }
      } catch (err) {
        console.error("Profile load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();

    // ✅ Listen for logout/session changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          navigate("/login");
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  /* ================= UPDATE PROFILE ================= */
  const handleUpdateProfile = async (e) => {
    if (e) e.preventDefault();

    if (pincode && pincode.length !== 6) {
      toast.warning("Please enter a valid 6-digit pincode.");
      return;
    }

    setSaving(true);
    try {
      // ✅ Get fresh session
      const { data: { session } } = await supabase.auth.getSession();
      let freshUser = session?.user;

      if (!freshUser) {
        const { data: { user: backupUser } } = await supabase.auth.getUser();
        freshUser = backupUser;
      }

      if (!freshUser) throw new Error("User not found. Please log in again.");

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const formattedPhone = `+91${cleanPhone}`;

      // 1. Auth Metadata first
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone_number: formattedPhone
        }
      });
      if (authError) throw authError;

      // 2. Profile table
      const { error: profileError } = await supabase
        .from("profile")
        .update({
          full_name: fullName.trim(), // Trimmed fullName here
          phone: formattedPhone, // Fixed: Using formattedPhone
          address: address.trim(),
          pincode: pincode.trim(),
        })
        .eq("id", freshUser.id);
      if (profileError) throw profileError;

      // 3. Update signup table (if applicable, based on original code)
      const { error: signupError } = await supabase
        .from("signup")
        .upsert({
          id: freshUser.id,
          full_name: fullName.trim(),
          email: email,
          phone: formattedPhone, // Fixed: Using formattedPhone
        });
      if (signupError) throw signupError;

      toast.success("Profile updated!");
      setIsEditing(false); // Close editing mode on success
    } catch (error) {
      console.error("Update error:", error);
      if (error.message?.includes("JWT") || error.message?.includes("sub claim")) {
        toast.error("Session expired. Please log in again.");
        await supabase.auth.signOut();
        navigate("/login");
      } else {
        toast.error(error.message);
      }
    } finally {
      setSaving(false); // Changed from setLoading to setSaving
    }
  };

  /* ================= LOGOUT ================= */
  const handleLogout = async () => {
    const ok = await confirm("Are you sure you want to log out?");
    if (ok) {
      await supabase.auth.signOut();
      navigate("/login");
    }
  };

  const handleSupportCall = () => {
    toast.info("Customer Care: 7617618567");
  };

  /* ================= RENDER ================= */
  if (loading) {
    return (
      <div className="profile-loading">
        <div className="spinner"></div>
        <p>Loading your profile...</p>
      </div>
    );
  }

  // Get Avatar Initials
  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="profile-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <Helmet>
        <title>My Profile | The Neatify Team | Cleaning Services in Hyderabad</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/profile" />
      </Helmet>
      <div className="profile-container">

        {/* HEADER SECTION */}
        <div className="profile-header-new">
          <button className="back-btn-minimal" onClick={() => navigate("/services")}>
            <FiArrowLeft size={20} />
          </button>

          <div className="avatar-section">
            <div className="avatar-circle">
              {getInitials(fullName)}
            </div>
            <div className="header-text">
              <h2 className="profile-title-new">{fullName || "User Profile"}</h2>
              <p className="profile-status-badge">
                <FiCheckCircle size={12} /> Verified Account
              </p>
            </div>
          </div>

          {!isEditing && (
            <button className="edit-mode-btn" onClick={() => setIsEditing(true)}>
              <FiEdit2 size={16} />
              <span>Edit</span>
            </button>
          )}
        </div>

        {/* QUICK ACTIONS STRIP */}
        <div className="quick-actions-bar">
          <button className="action-tile" onClick={() => navigate("/my-bookings")}>
            <div className="tile-icon-bg"><FiCalendar /></div>
            <span>My Bookings</span>
          </button>
          <button className="action-tile" onClick={handleSupportCall}>
            <div className="tile-icon-bg highlight"><FiPhoneCall /></div>
            <div className="tile-text-container">
              <span>Support</span>
              <small className="tile-subtitle">7617 618 567</small>
            </div>
          </button>
        </div>

        {/* MAIN FORM */}
        <form onSubmit={handleUpdateProfile} className="profile-glass-form">
          <div className="form-sections-grid">

            <div className="profile-input-group">
              <label className="input-label-premium">
                <FiUser size={14} /> Full Name
              </label>
              <div className={`premium-input-wrapper ${isEditing ? 'editing' : 'locked'}`}>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={fullName}
                  disabled={!isEditing}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="profile-input-group">
              <label className="input-label-premium">
                <FiMail size={14} /> Email Address
              </label>
              <div className="premium-input-wrapper locked disabled-bg">
                <input value={email} disabled />
              </div>
            </div>

            <div className="profile-input-group">
              <label className="input-label-premium">
                <FiPhone size={14} /> Phone Number
              </label>
              <div className={`premium-input-wrapper ${isEditing ? 'editing' : 'locked'} ${isEditing ? 'phone-wrapper-editing' : ''}`}>
                {isEditing && <span className="phone-prefix-premium">+91</span>}
                {!isEditing && <span className="phone-prefix-view">+91</span>}
                <input
                  type="tel"
                  placeholder="10-digit number"
                  value={phone}
                  disabled={!isEditing}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 10) setPhone(val);
                  }}
                  className={isEditing ? "phone-input-editing" : ""}
                />
              </div>
            </div>

            <div className="profile-input-group">
              <label className="input-label-premium">
                <FiHash size={14} /> Pincode
              </label>
              <div className={`premium-input-wrapper ${isEditing ? 'editing' : 'locked'}`}>
                <input
                  type="text"
                  placeholder="6-digit code"
                  value={pincode}
                  maxLength={6}
                  disabled={!isEditing}
                  onChange={(e) => setPincode(e.target.value)}
                />
              </div>
            </div>

            <div className="profile-input-group full-width">
              <label className="input-label-premium">
                <FiMapPin size={14} /> Service Address
              </label>
              <div className={`premium-input-wrapper textarea-mode ${isEditing ? 'editing' : 'locked'}`}>
                <textarea
                  placeholder="Enter your detailed address"
                  value={address}
                  disabled={!isEditing}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

          </div>

          {/* EDIT ACTIONS */}
          {isEditing && (
            <div className="edit-controls-floating">
              <button
                type="button"
                className="btn-cancel-premium"
                onClick={() => setIsEditing(false)}
              >
                <FiX /> Cancel
              </button>
              <button
                type="submit"
                className="btn-save-premium"
                disabled={saving}
              >
                {saving ? (
                  <div className="mini-spinner"></div>
                ) : (
                  <><FiSave /> Save Changes</>
                )}
              </button>
            </div>
          )}
        </form>

        {/* FOOTER ACTIONS */}
        <div className="profile-footer-new">
          <button className="btn-logout-premium" onClick={handleLogout}>
            <FiLogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>

      </div>
    </div>
  );
}
