# ---- Stage 1: Build the React App ----
FROM node:18-alpine AS build
WORKDIR /app

# Add this line to install Git inside the container
RUN apk update && apk add git
COPY package*.json ./
RUN npm install
COPY . .
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
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