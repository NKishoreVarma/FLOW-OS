export const PageContainer = ({ children, className = "" }) => (
  <div
    className={className}
    style={{
      maxWidth:  1200,
      margin:    "0 auto",
      padding:   "32px 32px",
      width:     "100%",
    }}
  >
    {children}
  </div>
);

export default PageContainer;
