module.exports.httpError = (code, message, data) => ({
  code: code,
  message: message,
  ...(data ? { data: data } : {}),
})