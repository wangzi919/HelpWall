import React from 'react';

const Background: React.FC = () => {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden">
      <svg
        className="absolute inset-0 w-full h-full opacity-40"
        preserveAspectRatio="none"
        viewBox="0 0 1440 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M-28.52 355.5C118.48 404.5 322.48 244.5 487.48 244.5C652.48 244.5 829.147 435.167 968.98 463C1108.81 490.833 1319.48 355.5 1473.48 322.5"
          fill="none"
          stroke="#B0E0E6"
          strokeLinecap="round"
          strokeWidth="150"
          className="opacity-30"
        />
        <path
          d="M1537 779C1390 730 1186 890 1021 890C856 890 679.333 699.333 539.5 671.5C399.667 643.667 189 779 -25 812"
          fill="none"
          stroke="#FFC0CB"
          strokeLinecap="round"
          strokeWidth="150"
          className="opacity-30"
        />
        <path
          d="M-55.5 90C91.5 139 295.5 -21 460.5 -21C625.5 -21 802.167 169.667 942 197.5C1081.83 225.333 1292.5 90 1446.5 57"
          fill="none"
          stroke="#FFFACD"
          strokeLinecap="round"
          strokeWidth="150"
          className="opacity-40"
        />
      </svg>
    </div>
  );
};

export default Background;