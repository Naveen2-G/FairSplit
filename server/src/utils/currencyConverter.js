require('dotenv').config();

const USD_TO_INR = parseFloat(process.env.USD_TO_INR) || 95.11;

/**
 * Convert an amount from one currency to INR.
 * All balances are computed in INR as the base currency.
 */
function convertToINR(amount, currency) {
  if (!currency || currency.toUpperCase() === 'INR') return amount;
  if (currency.toUpperCase() === 'USD') return parseFloat((amount * USD_TO_INR).toFixed(2));
  return amount; // Unknown currency, return as-is
}

/**
 * Get the exchange rate for display purposes.
 */
function getExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === 'USD' && toCurrency === 'INR') return USD_TO_INR;
  if (fromCurrency === 'INR' && toCurrency === 'USD') return parseFloat((1 / USD_TO_INR).toFixed(6));
  return 1;
}

module.exports = { convertToINR, getExchangeRate, USD_TO_INR };
