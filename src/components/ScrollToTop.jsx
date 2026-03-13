import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const location = useLocation();
  const { pathname } = location;

  useEffect(() => {
    // If we're returning from a detail page to services,
    // we let the Services component handle the scroll (to section instead of top)
    if (location.state?.fromDetail) return;
    window.scrollTo(0, 0);
  }, [pathname, location.state]);

  return null;
}
