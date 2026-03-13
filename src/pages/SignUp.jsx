import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";
import { FiEye, FiEyeOff, FiArrowLeft } from "react-icons/fi";

import { useToast } from "../components/Toast/ToastContext";

function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pincode, setPincode] = useState(""); // ✅ Added Pincode State
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const toast = useToast();

  const handleSignup = async () => {
    if (!fullName || !email || !password || !phone || !pincode) {
      toast.warning("Please fill all required fields.");
      return;
    }

    const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: fullName,
          full_name: fullName,
          phone_number: formattedPhone,
        },
      },
    });

    if (authError) {
      toast.error(authError.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.success("Account created! Please log in.");
      navigate("/login");
      return;
    }

    const { error: signupError } = await supabase.from("profile").upsert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      phone: formattedPhone,
      pincode,
    });

    if (signupError) {
      toast.error("Profile creation failed: " + signupError.message);
      return;
    }

    navigate("/services");
  };

  return (
    <div className="auth-page">
      <button className="back-btn-circle" onClick={() => navigate(-1)}>
        <FiArrowLeft size={20} />
      </button>
      <div className="auth-card">
        <h2 className="auth-title">Sign Up</h2>

        <input
          className="auth-input"
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          className="auth-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* Password Field */}
        <div className="password-wrapper">
          <input
            className="auth-input password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <span
            className={`eye-icon ${showPassword ? "active" : ""}`}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <FiEye /> : <FiEyeOff />}
          </span>
        </div>

        <input
          className="auth-input"
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          className="auth-input"
          type="text"
          placeholder="Pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value)}
        />

        <button className="auth-button" onClick={handleSignup}>
          Sign Up
        </button>
      </div>

      {/* ================= CSS INSIDE JSX ================= */}
      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(to right, #f9fafb, #f3f4f6);
          padding: 20px;
          position: relative;
        }

        .back-btn-circle {
          position: absolute;
          top: 30px;
          left: 30px;
          z-index: 10;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          color: #111827;
        }

        .back-btn-circle:hover {
          background: #f9fafb;
          transform: translateX(-5px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
        }

        @media (max-width: 640px) {
          .back-btn-circle {
            top: 20px;
            left: 20px;
            width: 38px;
            height: 38px;
          }
        }

        .auth-card {
          width: 100%;
          max-width: 380px;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 20px;
          padding: 40px 30px;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15);
          text-align: center;
        }

        .auth-title {
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 30px;
          color: #111;
        }

        .auth-input {
          width: 100%;
          height: 48px;
          margin-bottom: 18px;
          padding: 0 16px;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          font-size: 14px;
          background: #f9fafb;
          transition: all 0.25s ease;
          outline: none;
          box-sizing: border-box;
        }

        .auth-input:focus {
          border-color: #f4c430;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(244, 196, 48, 0.2);
        }

        .password-wrapper {
          position: relative;
          width: 100%;
          margin-bottom: 18px;
        }

        .password-input {
          padding-right: 48px;
        }

        .eye-icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          cursor: pointer;
          font-size: 18px;
          color: #6b7280;
          transition: 0.2s ease;
        }

        .eye-icon:hover {
          color: #111;
        }

        .eye-icon.active {
          color: #f4c430;
        }

        .auth-button {
          width: 100%;
          height: 50px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #f4c430, #f7d046);
          color: #111;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.3s ease;
        }

        .auth-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 15px 30px rgba(244, 196, 48, 0.35);
        }

        .auth-button:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

export default Signup;
