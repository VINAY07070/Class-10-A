# 🚀 Deployment Guide - Class 10-A Hub

## Overview

This guide covers deploying the Class 10-A Hub to various hosting platforms.

---

## Option 1: GitHub Pages (FREE & EASY)

### Steps

1. **Enable GitHub Pages**
   - Go to Settings → Pages
   - Source: Deploy from branch
   - Branch: `main` (or `develop`)
   - Click Save

2. **Update Links (if needed)**
   - If deploying to a subdirectory, update base paths:
   ```html
   <link rel="stylesheet" href="/Class-10-A/css/style.css">
   ```

3. **Wait for Deployment**
   - Takes 1-5 minutes
   - Check Settings → Pages for URL

4. **Access Your Site**
   ```
   https://VINAY07070.github.io/Class-10-A
   ```

### Pros
- Free forever
- Automatic deployments
- HTTPS included
- Easy to use

### Cons
- No backend support
- Public repository required (for free)
- Limited customization

---

## Option 2: Netlify (FREE with Paid Options)

### Steps

1. **Connect Repository**
   - Go to netlify.com
   - Click "New site from Git"
   - Select GitHub
   - Choose repository
   - Authorize Netlify

2. **Configure Build**
   - Build command: (leave empty)
   - Publish directory: (leave empty or set to `./`)
   - Click Deploy

3. **Wait for Deployment**
   - Takes 1-3 minutes
   - Netlify auto-generates a domain

4. **Custom Domain (Optional)**
   - Domain settings → Add custom domain
   - Update DNS records

### Pros
- Free tier is generous
- Easy custom domains
- Fast global CDN
- Form submissions

### Cons
- Free tier has limits
- Paid plans required for more features

---

## Option 3: Vercel (FREE with Paid Options)

### Steps

1. **Connect Repository**
   - Go to vercel.com
   - Click "New Project"
   - Select GitHub
   - Import repository

2. **Configure Project**
   - Framework: Other
   - Root directory: (leave empty)
   - Click Deploy

3. **Access Your Site**
   - Automatic domain provided
   - HTTPS enabled by default

### Pros
- Fast performance
- Easy deployment
- Free tier includes custom domains
- Edge functions available

### Cons
- Node.js focus
- Limited static options

---

## Option 4: Self-Hosted Server

### Requirements
- Server (AWS, DigitalOcean, Linode, etc.)
- Domain name
- SSH access

### Steps

1. **SSH into Server**
   ```bash
   ssh user@your-server.com
   ```

2. **Install Nginx or Apache**
   ```bash
   # Nginx
   sudo apt-get install nginx
   
   # Apache
   sudo apt-get install apache2
   ```

3. **Clone Repository**
   ```bash
   cd /var/www
   git clone https://github.com/VINAY07070/Class-10-A.git
   cd Class-10-A
   ```

4. **Configure Web Server**
   
   **For Nginx** (`/etc/nginx/sites-available/default`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/Class-10-A;
       index index.html;
       
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```
   
   **For Apache** (`/etc/apache2/sites-available/000-default.conf`):
   ```apache
   <VirtualHost *:80>
       ServerName your-domain.com
       DocumentRoot /var/www/Class-10-A
       
       <Directory /var/www/Class-10-A>
           AllowOverride All
       </Directory>
   </VirtualHost>
   ```

5. **Enable SSL (HTTPS)**
   ```bash
   # Using Let's Encrypt (Certbot)
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

6. **Restart Web Server**
   ```bash
   # Nginx
   sudo systemctl restart nginx
   
   # Apache
   sudo systemctl restart apache2
   ```

7. **Enable Auto-Updates**
   ```bash
   cd /var/www/Class-10-A
   git pull origin main
   ```

### Pros
- Full control
- No vendor lock-in
- Scalable
- Advanced customization

### Cons
- More complex setup
- Requires maintenance
- Potential security risks

---

## Recommended: GitHub Pages → Netlify/Vercel

**Best Practice**: Use GitHub Pages for automatic deployments + Netlify/Vercel for custom domain and advanced features.

---

## Environment Variables

For API keys or sensitive data, use environment files:

```javascript
// In deployment, use:
const API_KEY = process.env.API_KEY || 'default-key';
```

Set in:
- **GitHub Pages**: Not supported (static only)
- **Netlify**: Site settings → Build & deploy → Environment
- **Vercel**: Project settings → Environment Variables
- **Self-hosted**: `.env` file in root

---

## Monitoring & Maintenance

### Uptime Monitoring
- Use UptimeRobot.com (free)
- Monitors site every 5 minutes
- Alerts on downtime

### Analytics
- Google Analytics
- Netlify/Vercel built-in analytics
- Cloudflare analytics (if using)

### Backups
- GitHub is your backup
- Use GitHub Releases for version control
- Export data regularly

---

## Troubleshooting Deployment

### Site Shows 404
- Check repository is public (if using GitHub Pages)
- Verify branch name is correct
- Clear GitHub/browser cache

### Styles/JS Not Loading
- Verify file paths are relative
- Check CSS/JS URLs in HTML
- Clear cache and do hard refresh

### Custom Domain Not Working
- Verify DNS records (A/CNAME)
- Wait up to 48 hours for propagation
- Check DNS propagation: dnschecker.org

### Build Fails
- Check build logs in platform dashboard
- Verify Node version compatibility
- Ensure no build errors in console

---

## Performance Tips

1. **Enable Caching**
   - Set cache headers in web server
   - Use CDN for static assets

2. **Compress Assets**
   - Gzip CSS/JS files
   - Optimize images
   - Minify code

3. **Lazy Loading**
   - Load images on demand
   - Defer non-critical scripts
   - Use async/defer attributes

4. **Monitor Performance**
   - Use Lighthouse (Chrome DevTools)
   - Check PageSpeed Insights
   - Monitor Core Web Vitals

---

## Security Checklist

- [ ] Enable HTTPS/SSL
- [ ] Set security headers
- [ ] Keep dependencies updated
- [ ] Enable CORS if needed
- [ ] Sanitize user input
- [ ] Use environment variables for secrets
- [ ] Regular backups
- [ ] Monitor access logs

---

## Quick Deployment Script

```bash
#!/bin/bash

# Pull latest changes
git pull origin main

# Install dependencies (if any)
# npm install

# Build (if needed)
# npm run build

# Restart server
sudo systemctl restart nginx

echo "✅ Deployment complete!"
```

Save as `deploy.sh` and run with:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

**Last Updated**: September 16, 2026  
**Status**: ✅ Ready for Production