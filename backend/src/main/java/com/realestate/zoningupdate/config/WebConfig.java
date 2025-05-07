package com.realestate.zoningupdate.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.Collections;

@Configuration
public class WebConfig {

    @Value("${spring.mvc.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        // Enable all origins if wildcard is specified
        if (allowedOrigins.contains("*")) {
            config.addAllowedOrigin("*");
        } else {
            // Set allowed origins from properties
            Arrays.stream(allowedOrigins.split(","))
                    .map(String::trim)
                    .forEach(config::addAllowedOrigin);
        }

        // Allow all headers and methods for maximum compatibility
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");

        // Allow credentials
        config.setAllowCredentials(false);  // Change to true only if using cookies

        // Set max age for preflight requests
        config.setMaxAge(3600L);

        source.registerCorsConfiguration("/api/**", config);
        return new CorsFilter(source);
    }
}
