/* src/pages/UpdatePassword.jsx */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";

import { FiEye, FiEyeOff } from "react-icons/fi";
import "./UpdatePassword.css";

function UpdatePassword() {

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasSession, setHasSession] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();

    const handleBackToLogin = async () => {
        await supabase.auth.signOut();
        navigate("/login");
    };

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setHasSession(true);
            } else {
                // Wait briefly for Supabase to process the recovery hash
                setTimeout(async () => {
                    const { data: { session: retrySession } } = await supabase.auth.getSession();
                    if (retrySession) {
                        setHasSession(true);
                    } else {
                        setError("Reset session not found. Please try the link again.");
                    }
                }, 1000);
            }
        };
        checkSession();
    }, []);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) return setError("Passwords do not match.");
        if (password.length < 6) return setError("Password must be at least 6 characters.");

        setLoading(true);
        setError("");
        setMessage("");

        const { error: updateError } = await supabase.auth.updateUser({
            password: password,
        });

        setLoading(false);

        if (updateError) {
            setError(updateError.message);
        } else {
            setMessage("Password updated successfully!");
            // Sign out after update so they can test logging in with the NEW password
            setTimeout(async () => {
                await supabase.auth.signOut();
                navigate("/login");
            }, 2000);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h2 className="auth-title">Update Password</h2>
                <p className="auth-subtitle">Enter your new password below.</p>

                {message && <div className="success-message">{message}</div>}
                {error && <div className="error-message">{error}</div>}

                {!hasSession && !error && !message && (
                    <p className="auth-text" style={{ fontSize: "12px", color: "#666" }}>
                        Verifying session...
                    </p>
                )}

                {(hasSession || (!error && !message)) && (
                    <form onSubmit={handleUpdatePassword}>
                        <div className="input-wrapper">
                            <input
                                className="auth-input"
                                type={showPassword ? "text" : "password"}
                                placeholder="New Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="eye-button"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <FiEye /> : <FiEyeOff />}
                            </button>
                        </div>
                        <div className="input-wrapper">
                            <input
                                className="auth-input"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm New Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="eye-button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                {showConfirmPassword ? <FiEye /> : <FiEyeOff />}
                            </button>
                        </div>
                        <button className="auth-button" type="submit" disabled={loading}>
                            {loading ? "Updating..." : "Update Password"}
                        </button>
                    </form>
                )}

                <p className="auth-text" style={{ marginTop: "15px" }}>
                    <span onClick={handleBackToLogin}>Back to Login</span>
                </p>
            </div>
        </div>
    );
}

export default UpdatePassword;