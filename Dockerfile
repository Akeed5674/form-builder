
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm install
COPY . .
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80 to the outside world. Nginx listens on this port by default.
EXPOSE 80

# The command to start the Nginx server when the container starts.
CMD ["nginx", "-g", "daemon off;"]
