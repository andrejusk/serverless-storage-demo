import React from "react";
import Router from "next/router";

/**
 * Handle not found errors and redirect to index
 */
const NotFoundPage: React.FC = () => {
  React.useEffect(() => {
    Router.push("/");
  }, []);
  return null;
};

export default NotFoundPage;
