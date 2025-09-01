# ---- Stage 1: Build the React App ----
# Use an official Node.js image as the base for building.
FROM node:18-alpine AS build

# Set the working directory inside the container.
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies.
COPY package*.json ./

# Install the project dependencies.
RUN npm install

# Copy the rest of your application code into the container.
COPY . .

# IMPORTANT: Your Supabase URL and Key are needed during the build process.
# We will pass them in as arguments when we build the image.
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY

# Set the environment variables inside the container for the build command.
ENV VITE_SUPABASE_URL=$SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Build the app for production.
RUN npm run build


# ---- Stage 2: Serve the App with Nginx ----
# Use a lightweight Nginx image to serve the static files.
FROM nginx:stable-alpine

# Copy the built files from the 'build' stage to Nginx's public HTML folder.
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80 to the outside world. Nginx listens on this port by default.
EXPOSE 80

# The command to start the Nginx server when the container starts.
CMD ["nginx", "-g", "daemon off;"]