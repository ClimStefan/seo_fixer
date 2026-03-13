FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy all source files
COPY . .

# Expose the port Railway will use
EXPOSE 3003

CMD ["node", "index.js"]
