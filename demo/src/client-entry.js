import "react";
const pageLoaders = {
  "/": () => import("./pages/home.js"),
  "/product": () => import("./pages/product.js"),
  "/cart": () => import("./pages/cart.js"),
};
const appLoader = () => import("./pages/_app.js");
window.__pageLoaders = pageLoaders;
window.__appLoader = appLoader;
