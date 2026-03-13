import "./PageLoader.css";
import logo from "../components/logo1.png"; // change path if needed

export default function PageLoader() {
  return (
    <div className="page-loader">
      <div className="loader-wrapper">
        <div className="loader-spinner"></div>
        <img src={logo} alt="Neatify Logo" className="loader-logo" />
      </div>
    </div>
  );
}
