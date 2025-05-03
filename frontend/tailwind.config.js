module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        'zoning-residential': '#66bb6a',
        'zoning-commercial': '#42a5f5',
        'zoning-planned': '#ffeb3b',
        'zoning-unknown': '#cccccc',
      },
    },
  },
  plugins: [],
};
