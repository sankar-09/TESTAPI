function randomOtp(length = 6) {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

function formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const yyyy = date.getFullYear();

    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export async function generateAndStoreOtp(mobile: any, ttlMinutes: any) {
    const otp = randomOtp(6);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const fomrattedDt = formatDate(expiresAt)
    return { otp, expiresAt: fomrattedDt };
}

